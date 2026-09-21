"""Tests for the rules that are easy to get subtly wrong: XP, day/trip
completion, permissions and the mobile 'move' alternative to drag and drop."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import level_from_xp
from rewards.models import Achievement, XPTransaction
from rewards.services import DAY_COMPLETE_BONUS, TRIP_COMPLETE_BONUS, seed_achievements
from trips.models import Activity, Day, Trip, TripMember

User = get_user_model()


class SafarTestCase(TestCase):
    def setUp(self):
        seed_achievements()
        # Finishing your very first activity also unlocks "First Steps", whose
        # reward lands in the same XP total.
        self.first_steps_bonus = Achievement.objects.get(code="first-steps").xp_reward

        self.owner = User.objects.create_user("owner", password="safar1234", display_name="Owner")
        self.friend = User.objects.create_user("friend", password="safar1234", display_name="Friend")
        self.stranger = User.objects.create_user("stranger", password="safar1234")

        self.trip = Trip.objects.create(
            title="Goa Weekend",
            destination="Goa",
            region="Goa",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=2),
            created_by=self.owner,
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role="owner")
        TripMember.objects.create(trip=self.trip, user=self.friend, role="member")

        self.day1 = Day.objects.create(trip=self.trip, index=1, date=self.trip.start_date)
        self.day2 = Day.objects.create(
            trip=self.trip, index=2, date=self.trip.start_date + timedelta(days=1)
        )
        # Left deliberately empty — "Generate day plan" only fills blank days.
        self.day3 = Day.objects.create(
            trip=self.trip, index=3, date=self.trip.start_date + timedelta(days=2)
        )
        self.a1 = Activity.objects.create(day=self.day1, title="Beach", xp_value=40, order=0)
        self.a2 = Activity.objects.create(day=self.day1, title="Lunch", xp_value=20, order=1)
        self.a3 = Activity.objects.create(day=self.day2, title="Fort", xp_value=30, order=0)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class XPTests(SafarTestCase):
    def test_completing_an_activity_awards_its_xp(self):
        client = self.client_for(self.owner)
        response = client.post(f"/api/activities/{self.a1.id}/complete/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["xp_awarded"], 40)
        self.assertFalse(response.data["day_completed"])

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.xp, 40 + self.first_steps_bonus)
        # One row for the activity, one for the achievement that it unlocked.
        self.assertEqual(XPTransaction.objects.filter(user=self.owner).count(), 2)

    def test_finishing_every_activity_in_a_day_adds_the_day_bonus(self):
        client = self.client_for(self.owner)
        client.post(f"/api/activities/{self.a1.id}/complete/")
        response = client.post(f"/api/activities/{self.a2.id}/complete/")

        self.assertTrue(response.data["day_completed"])
        self.assertEqual(response.data["xp_awarded"], 20 + DAY_COMPLETE_BONUS)
        self.assertEqual(response.data["day_index"], 1)

    def test_last_activity_completes_the_whole_trip(self):
        client = self.client_for(self.owner)
        client.post(f"/api/activities/{self.a1.id}/complete/")
        client.post(f"/api/activities/{self.a2.id}/complete/")
        response = client.post(f"/api/activities/{self.a3.id}/complete/")

        self.assertTrue(response.data["trip_completed"])
        # activity + its day bonus + the trip bonus
        self.assertEqual(response.data["xp_awarded"], 30 + DAY_COMPLETE_BONUS + TRIP_COMPLETE_BONUS)

        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, "completed")

    def test_undo_takes_the_xp_back(self):
        client = self.client_for(self.owner)
        client.post(f"/api/activities/{self.a1.id}/complete/")
        client.post(f"/api/activities/{self.a1.id}/undo/")

        self.owner.refresh_from_db()
        # The activity XP is returned; an achievement once earned is kept.
        self.assertEqual(self.owner.xp, self.first_steps_bonus)
        self.a1.refresh_from_db()
        self.assertEqual(self.a1.status, "planned")
        self.assertIsNone(self.a1.completed_by)

    def test_completing_twice_does_not_double_count(self):
        client = self.client_for(self.owner)
        client.post(f"/api/activities/{self.a1.id}/complete/")
        client.post(f"/api/activities/{self.a1.id}/complete/")

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.xp, 40 + self.first_steps_bonus)

    def test_photo_requirement_blocks_completion_until_there_is_one(self):
        self.a1.requires_photo = True
        self.a1.save()

        response = self.client_for(self.owner).post(f"/api/activities/{self.a1.id}/complete/")
        self.assertEqual(response.status_code, 400)

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.xp, 0)

    def test_level_curve(self):
        self.assertEqual(level_from_xp(0), 1)
        self.assertEqual(level_from_xp(374), 1)
        self.assertEqual(level_from_xp(375), 2)
        # Reaching level 8 costs 375 * 7 * 8 / 2 = 10500 XP.
        self.assertEqual(level_from_xp(10_500), 8)
        self.assertEqual(level_from_xp(10_499), 7)

    def test_first_activity_unlocks_an_achievement(self):
        response = self.client_for(self.owner).post(f"/api/activities/{self.a1.id}/complete/")
        titles = [badge["title"] for badge in response.data["unlocked"]]
        self.assertIn("First Steps", titles)


class PermissionTests(SafarTestCase):
    def test_strangers_cannot_see_a_trip(self):
        response = self.client_for(self.stranger).get(f"/api/trips/{self.trip.id}/")
        self.assertEqual(response.status_code, 404)

    def test_plain_members_cannot_edit_the_plan(self):
        response = self.client_for(self.friend).patch(
            f"/api/trips/{self.trip.id}/", {"title": "Hijacked"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_plain_members_can_still_tick_activities_off(self):
        response = self.client_for(self.friend).post(f"/api/activities/{self.a1.id}/complete/")
        self.assertEqual(response.status_code, 200)

        self.a1.refresh_from_db()
        self.assertEqual(self.a1.completed_by, self.friend)

    def test_only_the_owner_can_delete(self):
        self.assertEqual(
            self.client_for(self.friend).delete(f"/api/trips/{self.trip.id}/").status_code, 403
        )
        self.assertEqual(
            self.client_for(self.owner).delete(f"/api/trips/{self.trip.id}/").status_code, 204
        )

    def test_joining_with_the_invite_code(self):
        response = self.client_for(self.stranger).post(
            "/api/trips/join/", {"code": self.trip.join_code}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.trip.members.filter(user=self.stranger).exists())

    def test_a_wrong_invite_code_is_rejected(self):
        response = self.client_for(self.stranger).post(
            "/api/trips/join/", {"code": "NOPE12"}, format="json"
        )
        self.assertEqual(response.status_code, 400)


class ItineraryTests(SafarTestCase):
    def test_creating_a_trip_generates_one_day_per_date(self):
        client = self.client_for(self.owner)
        response = client.post(
            "/api/trips/",
            {
                "title": "Manali Trip",
                "destination": "Manali",
                "start_date": str(date.today()),
                "end_date": str(date.today() + timedelta(days=3)),
                "trip_type": "friends",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["days"]), 4)
        self.assertEqual(response.data["my_role"], "owner")

    def test_end_date_before_start_date_is_rejected(self):
        response = self.client_for(self.owner).post(
            "/api/trips/",
            {
                "title": "Backwards",
                "destination": "Goa",
                "start_date": str(date.today()),
                "end_date": str(date.today() - timedelta(days=2)),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_generate_plan_fills_empty_days_only(self):
        client = self.client_for(self.owner)
        before = Activity.objects.filter(day=self.day1).count()

        response = client.post(f"/api/trips/{self.trip.id}/generate-plan/", {}, format="json")
        self.assertEqual(response.status_code, 200)

        # Days 1 and 2 already had plans, so they're left exactly as they were.
        self.assertEqual(Activity.objects.filter(day=self.day1).count(), before)
        self.assertEqual(Activity.objects.filter(day=self.day2).count(), 1)
        self.assertGreater(Activity.objects.filter(day=self.day3).count(), 1)

    def test_generate_plan_with_replace_overwrites_a_day(self):
        client = self.client_for(self.owner)
        client.post(
            f"/api/trips/{self.trip.id}/generate-plan/",
            {"day_index": 1, "replace": True},
            format="json",
        )
        self.assertFalse(Activity.objects.filter(day=self.day1, title="Beach").exists())
        self.assertGreater(Activity.objects.filter(day=self.day1).count(), 1)

    def test_generated_stops_carry_coordinates_for_the_map(self):
        client = self.client_for(self.owner)
        client.post(f"/api/trips/{self.trip.id}/generate-plan/", {"day_index": 3}, format="json")
        pinned = Activity.objects.filter(day=self.day3, latitude__isnull=False)
        self.assertTrue(pinned.exists())

    def test_move_down_swaps_the_order(self):
        client = self.client_for(self.owner)
        client.post(f"/api/activities/{self.a1.id}/move/", {"direction": "down"}, format="json")

        self.a1.refresh_from_db()
        self.a2.refresh_from_db()
        self.assertGreater(self.a1.order, self.a2.order)

    def test_move_to_another_day(self):
        client = self.client_for(self.owner)
        response = client.post(
            f"/api/activities/{self.a1.id}/move/", {"day_index": 2}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        self.a1.refresh_from_db()
        self.assertEqual(self.a1.day, self.day2)

    def test_moving_up_from_the_top_is_a_no_op(self):
        client = self.client_for(self.owner)
        client.post(f"/api/activities/{self.a1.id}/move/", {"direction": "up"}, format="json")

        self.a1.refresh_from_db()
        self.assertEqual(self.a1.order, 0)

    def test_shortening_a_trip_keeps_days_that_have_plans(self):
        client = self.client_for(self.owner)
        client.patch(
            f"/api/trips/{self.trip.id}/",
            {"end_date": str(self.trip.start_date)},
            format="json",
        )
        # Day 2 holds an activity, so it survives rather than silently vanishing.
        self.assertTrue(Day.objects.filter(pk=self.day2.pk).exists())


class LiveTripTests(SafarTestCase):
    def test_live_endpoint_reports_now_next_and_today(self):
        response = self.client_for(self.owner).get(f"/api/trips/{self.trip.id}/live/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["day"]["index"], 1)
        self.assertEqual(response.data["now"]["title"], "Beach")
        self.assertEqual(response.data["next"]["title"], "Lunch")
        self.assertEqual(response.data["total_today"], 2)
        self.assertEqual(response.data["completed_today"], 0)

    def test_live_moves_on_as_activities_are_completed(self):
        client = self.client_for(self.owner)
        client.post(f"/api/activities/{self.a1.id}/complete/")

        response = client.get(f"/api/trips/{self.trip.id}/live/")
        self.assertEqual(response.data["now"]["title"], "Lunch")
        self.assertEqual(response.data["completed_today"], 1)

    def test_summary_counts_the_journey(self):
        client = self.client_for(self.owner)
        self.a1.place_name = "Baga Beach"
        self.a1.save()
        client.post(f"/api/activities/{self.a1.id}/complete/")

        response = client.get(f"/api/trips/{self.trip.id}/summary/")
        self.assertEqual(response.data["activities_completed"], 1)
        self.assertEqual(response.data["locations"], 1)
        self.assertEqual(response.data["xp"], 40)


class TrackTests(SafarTestCase):
    def test_publishing_a_trip_as_a_track_and_reusing_it(self):
        client = self.client_for(self.owner)

        published = client.post(
            "/api/explore/tracks/from-trip/", {"trip": str(self.trip.id)}, format="json"
        )
        self.assertEqual(published.status_code, 201)
        track_id = published.data["track"]["id"]
        self.assertEqual(published.data["track"]["days"], self.trip.duration_days)

        copied = client.post(
            f"/api/explore/tracks/{track_id}/use/",
            {"start_date": str(date.today() + timedelta(days=30))},
            format="json",
        )
        self.assertEqual(copied.status_code, 201)
        self.assertEqual(len(copied.data["days"]), self.trip.duration_days)
        self.assertEqual(copied.data["days"][0]["activities"][0]["title"], "Beach")

    def test_use_rejects_a_bad_date(self):
        client = self.client_for(self.owner)
        published = client.post(
            "/api/explore/tracks/from-trip/", {"trip": str(self.trip.id)}, format="json"
        )
        response = client.post(
            f"/api/explore/tracks/{published.data['track']['id']}/use/",
            {"start_date": "20th March"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class ExpenseTests(SafarTestCase):
    def test_expenses_split_equally_across_the_group(self):
        client = self.client_for(self.owner)
        client.post(
            f"/api/trips/{self.trip.id}/expenses/",
            {"title": "Hotel", "amount": 4000, "category": "stay"},
            format="json",
        )

        response = client.get(f"/api/trips/{self.trip.id}/expenses/")
        self.assertEqual(response.data["total"], 4000)
        self.assertEqual(response.data["per_person_share"], 2000)

        balances = {row["user"]["username"]: row["balance"] for row in response.data["balances"]}
        self.assertEqual(balances["owner"], 2000)  # paid 4000, owes 2000
        self.assertEqual(balances["friend"], -2000)


class DestinationPlanningTests(SafarTestCase):
    """Destinations and places picked through Google are stored on the existing
    Trip and Activity rows, so later loads come from our own database."""

    def create_trip(self, **extra):
        payload = {
            "title": "Mumbai Weekend",
            "destination": "Mumbai",
            "address": "Mumbai, Maharashtra, India",
            "google_place_id": "ChIJwe1EZjDG5zsRaYxkjY_tpF0",
            "latitude": 19.076,
            "longitude": 72.8777,
            "area_radius_km": 18,
            "interests": ["food", "night"],
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=1)),
        }
        payload.update(extra)
        return self.client_for(self.owner).post("/api/trips/", payload, format="json")

    def test_trip_stores_destination_coordinates_area_and_interests(self):
        response = self.create_trip()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["latitude"], 19.076)
        self.assertEqual(response.data["area_radius_km"], 18)
        self.assertEqual(response.data["interests"], ["food", "night"])

        again = self.client_for(self.owner).get(f"/api/trips/{response.data['id']}/")
        self.assertEqual(again.data["google_place_id"], "ChIJwe1EZjDG5zsRaYxkjY_tpF0")
        self.assertEqual(again.data["address"], "Mumbai, Maharashtra, India")

    def test_a_trip_without_coordinates_is_still_valid(self):
        response = self.create_trip(latitude=None, longitude=None, area_radius_km=0)
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["latitude"])

    def test_out_of_range_coordinates_are_rejected(self):
        self.assertEqual(self.create_trip(latitude=123).status_code, 400)
        self.assertEqual(self.create_trip(longitude=-400).status_code, 400)

    def test_absurd_area_or_interest_lists_are_rejected(self):
        self.assertEqual(self.create_trip(area_radius_km=9000).status_code, 400)
        self.assertEqual(self.create_trip(interests=["x"] * 20).status_code, 400)

    def test_a_picked_place_is_saved_on_the_activity(self):
        response = self.client_for(self.owner).post(
            f"/api/days/{self.day3.id}/activities/",
            {
                "title": "Marine Drive",
                "place_name": "Marine Drive",
                "place_address": "Netaji Subhash Chandra Bose Rd, Mumbai",
                "google_place_id": "ChIJmarine",
                "latitude": 18.943,
                "longitude": 72.8238,
                "place_rating": 4.7,
                "category": "sightseeing",
                "start_time": "18:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        activity = Activity.objects.get(pk=response.data["id"])
        self.assertEqual(activity.google_place_id, "ChIJmarine")
        self.assertEqual(activity.place_rating, 4.7)
        self.assertEqual(activity.day, self.day3)

    def test_a_place_with_impossible_coordinates_is_rejected(self):
        response = self.client_for(self.owner).post(
            f"/api/days/{self.day3.id}/activities/",
            {"title": "Nowhere", "latitude": 95, "longitude": 10},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_plain_members_cannot_add_places_to_the_plan(self):
        response = self.client_for(self.friend).post(
            f"/api/days/{self.day3.id}/activities/",
            {"title": "Sneaky stop", "latitude": 18.9, "longitude": 72.8},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_a_place_can_be_given_a_visit_time_later(self):
        response = self.client_for(self.owner).patch(
            f"/api/activities/{self.a1.id}/", {"start_time": "09:30"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.a1.refresh_from_db()
        self.assertEqual(str(self.a1.start_time), "09:30:00")

    def test_coordinates_can_be_filled_in_later_for_an_existing_trip(self):
        """Older trips have no coordinates; the map backfills them from Google."""
        response = self.client_for(self.owner).patch(
            f"/api/trips/{self.trip.id}/",
            {"latitude": 15.49, "longitude": 73.83, "area_radius_km": 30},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.latitude, 15.49)
        self.assertEqual(self.trip.area_radius_km, 30)

    def test_plain_members_cannot_change_the_destination(self):
        response = self.client_for(self.friend).patch(
            f"/api/trips/{self.trip.id}/", {"latitude": 1, "longitude": 1}, format="json"
        )
        self.assertEqual(response.status_code, 403)
