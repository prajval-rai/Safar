"""Open trips: upcoming trips anyone can find in Explore and join."""

from notifications.models import Notification
from trips.models import TripMember
from trips.tests import SafarTestCase

LIST = "/api/explore/open-trips/"


class OpenTripTests(SafarTestCase):
    def open(self, value=True, user=None):
        return self.client_for(user or self.owner).patch(
            f"/api/trips/{self.trip.id}/", {"open_to_join": value}, format="json"
        )

    def listed(self, user=None):
        return [t["id"] for t in self.client_for(user or self.stranger).get(LIST).data]

    def test_only_opened_trips_are_listed(self):
        self.assertNotIn(str(self.trip.id), self.listed())
        self.assertEqual(self.open().status_code, 200)
        self.assertIn(str(self.trip.id), self.listed())
        self.open(False)
        self.assertNotIn(str(self.trip.id), self.listed())

    def test_only_organisers_can_open_a_trip(self):
        self.assertEqual(self.open(user=self.friend).status_code, 403)

    def test_anyone_can_join_without_the_code(self):
        self.open()
        response = self.client_for(self.stranger).post(f"{LIST}{self.trip.id}/join/")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(TripMember.objects.filter(trip=self.trip, user=self.stranger).exists())
        self.assertTrue(
            Notification.objects.filter(user=self.owner, kind="trip_joined", actor=self.stranger).exists()
        )
        row = next(t for t in self.client_for(self.stranger).get(LIST).data if t["id"] == str(self.trip.id))
        self.assertTrue(row["is_member"])
        self.assertEqual(row["member_count"], 3)
        # The code itself is never handed out.
        self.assertNotIn("join_code", row)

    def test_a_closed_trip_cannot_be_joined(self):
        response = self.client_for(self.stranger).post(f"{LIST}{self.trip.id}/join/")
        self.assertEqual(response.status_code, 400)

    def test_finished_trips_drop_off_and_cannot_be_opened(self):
        self.open()
        self.trip.status = "completed"
        self.trip.save()
        self.assertNotIn(str(self.trip.id), self.listed())
        self.assertEqual(self.open().status_code, 400)
