"""Each XP loophole we found, replayed — and shut.

A farmer who never leaves home, a teleporting GPS, re-saved photos, throwaway
referral accounts, fake followers, and penalties dodged at 0 XP."""

import shutil
import tempfile
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image

from accounts.models import Follow
from rewards.services import (
    CHECKIN_XP,
    DAILY_XP_CAP,
    MAX_PHOTO_XP_PER_TRIP,
    MEMORY_XP,
    REFERRAL_XP,
    _stats,
    award_xp,
)
from trips.models import Activity, DayBonus, LocationFix, Trip
from trips.tests import BAGA, CALANGUTE, FORT_AGUADA, MUMBAI, SafarTestCase

PUNE = (18.5204, 73.8567)
GOA = (15.49, 73.83)


def at(point, **extra):
    return {"latitude": point[0], "longitude": point[1], "accuracy": 10, **extra}


def forget_where_everyone_was():
    """Push every recorded location a day into the past, as if the traveller
    had had time to get anywhere since."""
    LocationFix.objects.update(at=timezone.now() - timedelta(days=1))


class HomeFarmTests(SafarTestCase):
    """The big one: a "Goa" trip, every stop pinned at home, ticked off from the sofa."""

    def plan(self, planner=PUNE, days=3):
        body = {
            "title": "Goa",
            "destination": "Goa",
            "latitude": GOA[0],
            "longitude": GOA[1],
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=days - 1)),
            "trip_type": "friends",
        }
        if planner:
            body.update(planner_latitude=planner[0], planner_longitude=planner[1])
        response = self.client_for(self.owner).post("/api/trips/", body, format="json")
        self.assertEqual(response.status_code, 201)
        return Trip.objects.get(pk=response.data["id"])

    def stop(self, trip, point, day=1):
        return Activity.objects.create(
            day=trip.days.get(index=day), title="Spot", latitude=point[0], longitude=point[1]
        )

    def test_planning_without_a_location_earns_nothing(self):
        trip = self.plan(planner=None)
        self.assertTrue(trip.no_xp)
        self.assertEqual(trip.no_xp_reason, "no_location")
        response = self.client_for(self.owner).post(
            f"/api/activities/{self.stop(trip, PUNE).id}/checkin/", at(PUNE), format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["xp_awarded"], 0)

    def test_sharing_a_location_later_fixes_it(self):
        trip = self.plan(planner=None)
        response = self.client_for(self.owner).post(f"/api/trips/{trip.id}/locate/", at(PUNE), format="json")
        self.assertEqual(response.status_code, 200)
        trip.refresh_from_db()
        self.assertFalse(trip.no_xp)
        self.assertEqual(trip.start_point, PUNE)

    def test_stops_pinned_round_the_house_earn_nothing(self):
        trip = self.plan()
        self.assertEqual(trip.start_point, PUNE)
        home_stop = self.stop(trip, (PUNE[0] + 0.001, PUNE[1]))
        response = self.client_for(self.owner).post(
            f"/api/activities/{home_stop.id}/checkin/", at(PUNE), format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["xp_awarded"], 0)
        self.assertIn("close to where the trip started", response.data["note"])

    def test_check_in_waits_for_the_trip_to_start(self):
        trip = self.plan()
        Trip.objects.filter(pk=trip.pk).update(start_date=date.today() + timedelta(days=5))
        forget_where_everyone_was()
        response = self.client_for(self.owner).post(
            f"/api/activities/{self.stop(trip, BAGA).id}/checkin/", at(BAGA), format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_a_cluster_of_stops_on_one_spot_pays_check_in_once(self):
        trip = self.plan()
        forget_where_everyone_was()
        client = self.client_for(self.owner)
        first = client.post(f"/api/activities/{self.stop(trip, BAGA).id}/checkin/", at(BAGA), format="json")
        second = client.post(f"/api/activities/{self.stop(trip, BAGA).id}/checkin/", at(BAGA), format="json")
        self.assertEqual(first.data["xp_awarded"], CHECKIN_XP)
        self.assertEqual(second.data["xp_awarded"], 0)


class TeleportTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.a1.latitude, self.a1.longitude = BAGA
        self.a1.save()
        self.trip.status = "active"
        self.trip.save()

    def test_jumping_hundreds_of_km_in_a_minute_is_refused(self):
        LocationFix.objects.create(user=self.friend, latitude=PUNE[0], longitude=PUNE[1], at=timezone.now(), source="checkin")
        response = self.client_for(self.friend).post(f"/api/activities/{self.a1.id}/checkin/", at(BAGA), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("faster than anyone", str(response.data["detail"]))

    def test_the_same_trip_a_day_later_is_fine(self):
        LocationFix.objects.create(
            user=self.friend, latitude=PUNE[0], longitude=PUNE[1], at=timezone.now() - timedelta(hours=12), source="checkin"
        )
        response = self.client_for(self.friend).post(f"/api/activities/{self.a1.id}/checkin/", at(BAGA), format="json")
        self.assertEqual(response.status_code, 200)

    def test_a_reading_without_its_accuracy_is_refused(self):
        body = {"latitude": BAGA[0], "longitude": BAGA[1]}
        response = self.client_for(self.friend).post(f"/api/activities/{self.a1.id}/checkin/", body, format="json")
        self.assertEqual(response.status_code, 400)


class CalendarTests(SafarTestCase):
    """A day's bonus comes on its own day — at most one a day."""

    def setUp(self):
        super().setUp()
        for activity, point in ((self.a1, BAGA), (self.a2, CALANGUTE), (self.a3, FORT_AGUADA)):
            activity.latitude, activity.longitude = point
            activity.save()
        self.trip.start_latitude, self.trip.start_longitude = MUMBAI
        self.trip.save()

    def complete(self, activity):
        forget_where_everyone_was()
        return self.client_for(self.owner).post(
            f"/api/activities/{activity.id}/complete/", at((activity.latitude, activity.longitude)), format="json"
        )

    def test_a_days_bonus_waits_for_its_date(self):
        # Day 2 is tomorrow: finishing it today pays no day bonus.
        response = self.complete(self.a3)
        self.assertFalse(DayBonus.objects.filter(user=self.owner, day=self.day2).exists())
        self.assertEqual(response.status_code, 200)

    def test_only_one_day_bonus_per_real_day(self):
        self.day1.date = self.day2.date = date.today() - timedelta(days=3)
        self.day1.save()
        self.day2.save()
        for activity in (self.a1, self.a2, self.a3):
            self.complete(activity)
        self.assertEqual(DayBonus.objects.filter(user=self.owner).count(), 1)


class DailyCapTests(SafarTestCase):
    def test_nobody_earns_more_than_the_cap_in_a_day(self):
        award_xp(self.friend, DAILY_XP_CAP - 5, "Lots of travelling")
        txn = award_xp(self.friend, 20, "More travelling")
        self.assertEqual(txn.amount, Decimal("5.00"))
        self.assertIsNone(award_xp(self.friend, 1, "Even more"))
        self.friend.refresh_from_db()
        self.assertEqual(self.friend.xp, DAILY_XP_CAP)

    def test_achievements_are_outside_the_cap(self):
        award_xp(self.friend, DAILY_XP_CAP, "A big day")
        self.assertIsNotNone(award_xp(self.friend, 5, "Achievement: First Steps", kind="bonus", achievement=True))


class DebtTests(SafarTestCase):
    def test_a_penalty_at_zero_xp_is_owed_not_forgotten(self):
        award_xp(self.friend, -3, "Left a trip", kind="bonus")
        self.friend.refresh_from_db()
        self.assertEqual((self.friend.xp, self.friend.xp_debt), (0, 3))

        award_xp(self.friend, 2, "A stop")
        self.friend.refresh_from_db()
        self.assertEqual((self.friend.xp, self.friend.xp_debt), (0, 1))

        award_xp(self.friend, 5, "Another stop")
        self.friend.refresh_from_db()
        self.assertEqual((self.friend.xp, self.friend.xp_debt), (4, 0))


def photo(seed: int, fmt="PNG", quality=95) -> bytes:
    """A picture with real structure (a dHash of a flat colour says nothing)."""
    img = Image.new("RGB", (64, 48))
    img.putdata([((x * 7 + seed * 40) % 256, (y * 11 + seed * 90) % 256, ((x ^ y) * seed) % 256)
                 for y in range(48) for x in range(64)])
    buffer = BytesIO()
    img.save(buffer, format=fmt, quality=quality)
    return buffer.getvalue()


TEST_MEDIA = tempfile.mkdtemp(prefix="safar-anticheat-media-")


@override_settings(MEDIA_ROOT=TEST_MEDIA)
class PhotoTests(SafarTestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA, ignore_errors=True)

    def setUp(self):
        super().setUp()
        self.was_at(self.friend, self.a1)

    def upload(self, content, name="shot.png", kind="image/png"):
        return self.client_for(self.friend).post(
            f"/api/trips/{self.trip.id}/memories/",
            {"image": SimpleUploadedFile(name, content, content_type=kind)},
            format="multipart",
        )

    def test_a_re_saved_copy_is_caught(self):
        self.assertEqual(self.upload(photo(1)).data["xp_awarded"], MEMORY_XP)
        again = self.upload(photo(1, fmt="JPEG", quality=70), name="copy.jpg", kind="image/jpeg")
        self.assertEqual(again.status_code, 201)
        self.assertEqual(again.data["xp_awarded"], 0)
        self.assertTrue(again.data["duplicate_photo"])

    def test_links_earn_nothing(self):
        response = self.client_for(self.friend).post(
            f"/api/trips/{self.trip.id}/memories/", {"image_url": "https://example.com/a.jpg"}, format="json"
        )
        self.assertEqual(response.data["xp_awarded"], 0)

    def test_photo_xp_is_capped_per_trip(self):
        award_xp(self.friend, MAX_PHOTO_XP_PER_TRIP, "Earlier photos", kind="photo", trip=self.trip, capped=False)
        response = self.upload(photo(7))
        self.assertEqual(response.data["xp_awarded"], 0)
        self.assertIn(str(MAX_PHOTO_XP_PER_TRIP), response.data["note"])


class ReferralTests(SafarTestCase):
    """A referral pays once the new traveller finishes a real trip — not at signup."""

    def setUp(self):
        super().setUp()
        self.friend.referred_by = self.stranger
        self.friend.save()
        self.a1.latitude, self.a1.longitude = BAGA
        self.a1.save()
        self.a2.delete()
        self.a3.delete()

    def finish(self):
        forget_where_everyone_was()
        self.client_for(self.owner).post(f"/api/activities/{self.a1.id}/complete/", at(BAGA), format="json")

    def test_paid_when_they_finish_a_trip_they_were_on(self):
        self.was_at(self.friend, self.a1)
        self.finish()
        self.stranger.refresh_from_db()
        self.assertEqual(self.stranger.xp, REFERRAL_XP)

    def test_not_paid_for_a_trip_they_followed_from_home(self):
        self.finish()
        self.stranger.refresh_from_db()
        self.assertEqual(self.stranger.xp, 0)

    def test_at_most_five_a_month(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        for i in range(5):
            User.objects.create_user(
                f"paid{i}", password="x", referred_by=self.stranger, referral_paid_at=timezone.now()
            )
        self.was_at(self.friend, self.a1)
        self.finish()
        self.stranger.refresh_from_db()
        self.assertEqual(self.stranger.xp, 0)


class FollowerTests(SafarTestCase):
    def test_only_followers_who_travel_count(self):
        Follow.objects.create(follower=self.friend, following=self.owner)
        Follow.objects.create(follower=self.stranger, following=self.owner)
        self.assertEqual(_stats(self.owner)["followers"], 0)

        self.a1.status = "completed"
        self.a1.save()
        self.trip.status = "completed"
        self.trip.save()
        self.was_at(self.friend, self.a1)
        self.assertEqual(_stats(self.owner)["followers"], 1)


class PastTripEvidenceTests(SafarTestCase):
    def test_the_reviewer_sees_what_the_photos_say(self):
        from trips.models import Memory
        from trips.past import photo_evidence

        self.trip.latitude, self.trip.longitude = GOA
        memory = Memory.objects.create(
            trip=self.trip,
            user=self.owner,
            image_url="https://example.com/x.jpg",
            taken_at=timezone.now() - timedelta(days=400),
            photo_latitude=PUNE[0],
            photo_longitude=PUNE[1],
            is_original=False,
        )
        evidence = photo_evidence(memory, self.trip)
        self.assertFalse(evidence["in_dates"])
        self.assertFalse(evidence["near_destination"])
        self.assertTrue(evidence["linked"])
        self.assertTrue(evidence["seen_before"])

