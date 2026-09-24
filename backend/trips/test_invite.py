"""Opening an invite link: see the trip first, then choose to join."""

from rest_framework.test import APIClient

from trips.models import TripMember
from trips.tests import SafarTestCase


class InvitePreviewTests(SafarTestCase):
    def preview(self, user=None, code=None):
        client = self.client_for(user) if user else APIClient()
        return client.get(f"/api/trips/invite/{code or self.trip.join_code}/")

    def test_anyone_with_the_link_can_see_the_trip_without_joining(self):
        response = self.preview()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Goa Weekend")
        self.assertEqual(len(response.data["members"]), 2)
        self.assertEqual(response.data["days"][0]["stops"][0]["title"], "Beach")
        self.assertFalse(response.data["is_member"])
        self.assertIsNone(response.data["trip_id"])
        # Looking doesn't join.
        self.assertFalse(TripMember.objects.filter(trip=self.trip, user=self.stranger).exists())
        self.assertFalse(self.preview(self.stranger).data["is_member"])

    def test_members_get_the_trip_id_to_open_it(self):
        response = self.preview(self.friend)
        self.assertTrue(response.data["is_member"])
        self.assertEqual(response.data["trip_id"], str(self.trip.id))

    def test_codes_are_case_insensitive_and_unknown_ones_404(self):
        self.assertEqual(self.preview(code=self.trip.join_code.lower()).status_code, 200)
        self.assertEqual(self.preview(code="ZZZZZZ").status_code, 404)

    def test_finished_or_cancelled_trips_cannot_be_joined(self):
        self.trip.status = "cancelled"
        self.trip.save()
        self.assertFalse(self.preview().data["can_join"])
        response = self.client_for(self.stranger).post(
            "/api/trips/join/", {"code": self.trip.join_code}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        # Existing members still get the trip back rather than an error.
        response = self.client_for(self.friend).post(
            "/api/trips/join/", {"code": self.trip.join_code}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_a_stale_token_is_treated_as_signed_out(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        response = client.get(f"/api/trips/invite/{self.trip.join_code}/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_member"])
