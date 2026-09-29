"""Open trips: upcoming trips anyone can find in Explore and ask to join —
an organiser approves each request before anyone is on the trip."""

from datetime import timedelta

from notifications.models import Notification
from trips.models import TripJoinRequest, TripMember
from trips.tests import SafarTestCase

LIST = "/api/explore/open-trips/"


class OpenTripTests(SafarTestCase):
    def open(self, value=True, user=None):
        return self.client_for(user or self.owner).patch(
            f"/api/trips/{self.trip.id}/", {"open_to_join": value}, format="json"
        )

    def listed(self, user=None):
        return [t["id"] for t in self.client_for(user or self.stranger).get(LIST).data]

    def ask(self, user=None):
        return self.client_for(user or self.stranger).post(f"{LIST}{self.trip.id}/join/")

    def answer(self, join_request, decision, user=None):
        return self.client_for(user or self.owner).post(
            f"/api/trips/{self.trip.id}/join-requests/{join_request.id}/{decision}/"
        )

    def test_only_opened_trips_are_listed(self):
        self.assertNotIn(str(self.trip.id), self.listed())
        self.assertEqual(self.open().status_code, 200)
        self.assertIn(str(self.trip.id), self.listed())
        self.open(False)
        self.assertNotIn(str(self.trip.id), self.listed())

    def test_only_organisers_can_open_a_trip(self):
        self.assertEqual(self.open(user=self.friend).status_code, 403)

    def test_joining_sends_a_request_not_a_seat(self):
        self.open()
        response = self.ask()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "pending")
        self.assertFalse(TripMember.objects.filter(trip=self.trip, user=self.stranger).exists())
        self.assertTrue(
            Notification.objects.filter(user=self.owner, kind="join_request", actor=self.stranger).exists()
        )
        row = next(t for t in self.client_for(self.stranger).get(LIST).data if t["id"] == str(self.trip.id))
        self.assertFalse(row["is_member"])
        self.assertEqual(row["request_status"], "pending")
        # The code itself is never handed out.
        self.assertNotIn("join_code", row)
        # Asking twice doesn't pile up requests.
        self.assertEqual(self.ask().status_code, 200)
        self.assertEqual(TripJoinRequest.objects.filter(trip=self.trip).count(), 1)

    def test_organiser_approves_a_request(self):
        self.open()
        self.ask()
        pending = self.client_for(self.owner).get(f"/api/trips/{self.trip.id}/join-requests/")
        self.assertEqual(len(pending.data), 1)
        join_request = TripJoinRequest.objects.get(trip=self.trip, user=self.stranger)

        # A plain traveller on the trip can't decide.
        self.assertEqual(self.answer(join_request, "approve", user=self.friend).status_code, 403)
        self.assertEqual(self.answer(join_request, "approve").status_code, 200)
        self.assertTrue(TripMember.objects.filter(trip=self.trip, user=self.stranger).exists())
        self.assertTrue(
            Notification.objects.filter(user=self.stranger, kind="join_request_approved").exists()
        )
        row = next(t for t in self.client_for(self.stranger).get(LIST).data if t["id"] == str(self.trip.id))
        self.assertTrue(row["is_member"])
        self.assertEqual(row["member_count"], 3)
        # Already answered.
        self.assertEqual(self.answer(join_request, "decline").status_code, 400)

    def test_declined_request_cannot_be_resent(self):
        self.open()
        self.ask()
        join_request = TripJoinRequest.objects.get(trip=self.trip, user=self.stranger)
        self.assertEqual(self.answer(join_request, "decline").status_code, 200)
        self.assertFalse(TripMember.objects.filter(trip=self.trip, user=self.stranger).exists())
        self.assertTrue(
            Notification.objects.filter(user=self.stranger, kind="join_request_declined").exists()
        )
        self.assertEqual(self.ask().status_code, 400)

    def test_a_pending_request_can_be_withdrawn(self):
        self.open()
        self.ask()
        response = self.client_for(self.stranger).delete(f"{LIST}{self.trip.id}/join/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TripJoinRequest.objects.filter(trip=self.trip).exists())

    def test_a_closed_trip_cannot_be_joined(self):
        self.assertEqual(self.ask().status_code, 400)

    def test_only_upcoming_trips_are_listed(self):
        self.open()
        self.trip.status = "active"
        self.trip.save()
        self.assertNotIn(str(self.trip.id), self.listed())
        self.trip.status = "planning"
        self.trip.start_date = self.trip.start_date - timedelta(days=1)
        self.trip.save()
        self.assertNotIn(str(self.trip.id), self.listed())

    def test_finished_trips_drop_off_and_cannot_be_opened(self):
        self.open()
        self.trip.status = "completed"
        self.trip.save()
        self.assertNotIn(str(self.trip.id), self.listed())
        self.assertEqual(self.open().status_code, 400)
