"""Starting, finishing and cancelling trips."""

from datetime import date, timedelta

from trips.models import Activity, Day, Trip, TripMember
from trips.tests import SafarTestCase


class LifecycleTests(SafarTestCase):
    def second_trip(self, owner=None):
        owner = owner or self.owner
        trip = Trip.objects.create(
            title="Jaipur",
            destination="Jaipur",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=1),
            created_by=owner,
        )
        TripMember.objects.create(trip=trip, user=owner, role="owner")
        day = Day.objects.create(trip=trip, index=1, date=trip.start_date)
        activity = Activity.objects.create(day=day, title="Amber Fort", order=0)
        return trip, activity

    def test_only_one_trip_can_be_live_at_a_time(self):
        other, _ = self.second_trip()
        client = self.client_for(self.owner)
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/start/").status_code, 200)
        res = client.post(f"/api/trips/{other.id}/start/")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Goa Weekend", res.data["detail"])
        other.refresh_from_db()
        self.assertEqual(other.status, "planning")

    def test_starting_a_live_trip_again_is_harmless(self):
        client = self.client_for(self.owner)
        client.post(f"/api/trips/{self.trip.id}/start/")
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/start/").status_code, 200)

    def test_doing_a_stop_cannot_sneak_a_second_trip_live(self):
        other, activity = self.second_trip()
        client = self.client_for(self.owner)
        client.post(f"/api/trips/{self.trip.id}/start/")
        res = client.post(f"/api/activities/{activity.id}/complete/")
        self.assertEqual(res.status_code, 400)
        activity.refresh_from_db()
        self.assertEqual(activity.status, "planned")

    def test_cancelling_frees_the_slot(self):
        other, _ = self.second_trip()
        client = self.client_for(self.owner)
        client.post(f"/api/trips/{self.trip.id}/start/")
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/cancel/").status_code, 200)
        self.assertEqual(client.post(f"/api/trips/{other.id}/start/").status_code, 200)

    def test_cancelled_trip_cannot_start_or_be_ticked_off_until_reopened(self):
        client = self.client_for(self.owner)
        client.post(f"/api/trips/{self.trip.id}/cancel/")
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/start/").status_code, 400)
        self.assertEqual(client.post(f"/api/activities/{self.a1.id}/complete/").status_code, 400)
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/reopen/").status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, "planning")

    def test_members_cannot_cancel_and_finished_trips_cannot_be_cancelled(self):
        self.assertEqual(self.client_for(self.friend).post(f"/api/trips/{self.trip.id}/cancel/").status_code, 403)
        client = self.client_for(self.owner)
        for a in (self.a1, self.a2, self.a3):
            client.post(f"/api/activities/{a.id}/complete/")
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, "completed")
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/cancel/").status_code, 400)

    def test_a_trip_only_completes_by_finishing_its_itinerary(self):
        client = self.client_for(self.owner)
        # The old "mark trip completed" shortcut is gone…
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/complete/").status_code, 404)
        # …status can't be forced through a plain edit either…
        client.patch(f"/api/trips/{self.trip.id}/", {"status": "completed"}, format="json")
        self.trip.refresh_from_db()
        self.assertNotEqual(self.trip.status, "completed")
        # …and finishing the last stop does it.
        for a in (self.a1, self.a2):
            client.post(f"/api/activities/{a.id}/complete/")
        self.trip.refresh_from_db()
        self.assertNotEqual(self.trip.status, "completed")
        client.post(f"/api/activities/{self.a3.id}/complete/")
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, "completed")

    def test_budget_and_people_can_be_changed_after_creating_a_trip(self):
        client = self.client_for(self.owner)
        res = client.patch(f"/api/trips/{self.trip.id}/", {"budget_per_person": 15000}, format="json")
        self.assertEqual(res.status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.budget_per_person, 15000)
        self.assertEqual(
            self.client_for(self.friend).patch(f"/api/trips/{self.trip.id}/", {"budget_per_person": 1}, format="json").status_code,
            403,
        )
        member = TripMember.objects.get(trip=self.trip, user=self.friend)
        self.assertEqual(client.delete(f"/api/trips/{self.trip.id}/members/{member.id}/").status_code, 204)
        self.assertEqual(client.post(f"/api/trips/{self.trip.id}/members/", {"username": "stranger"}, format="json").status_code, 201)


class ChatTests(SafarTestCase):
    def test_first_load_is_the_latest_messages_and_after_returns_only_new_ones(self):
        from trips.models import ChatMessage

        for i in range(205):
            ChatMessage.objects.create(trip=self.trip, user=self.owner, text=f"m{i}")
        client = self.client_for(self.friend)

        first = client.get(f"/api/trips/{self.trip.id}/chat/").data
        self.assertEqual(len(first), 200)
        self.assertEqual(first[-1]["text"], "m204")

        sent = client.post(f"/api/trips/{self.trip.id}/chat/", {"text": "hi"}, format="json").data
        new = client.get(f"/api/trips/{self.trip.id}/chat/?after={first[-1]['id']}").data
        self.assertEqual([m["id"] for m in new], [sent["id"]])
        self.assertEqual(client.get(f"/api/trips/{self.trip.id}/chat/?after={sent['id']}").data, [])

    def test_strangers_cannot_read_the_chat(self):
        self.assertEqual(self.client_for(self.stranger).get(f"/api/trips/{self.trip.id}/chat/").status_code, 404)
