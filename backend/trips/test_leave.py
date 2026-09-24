"""Leaving a trip you joined — and what it costs."""

from notifications.models import Notification
from rewards.services import LEAVE_PENALTY_LIVE, LEAVE_PENALTY_PLANNING
from trips.models import TripMember
from trips.tests import SafarTestCase


class LeaveTripTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.friend.xp = 50
        self.friend.save(update_fields=["xp"])

    def leave(self, user):
        return self.client_for(user).post(f"/api/trips/{self.trip.id}/leave/")

    def test_the_trip_tells_a_member_what_leaving_would_cost(self):
        detail = self.client_for(self.friend).get(f"/api/trips/{self.trip.id}/").data
        self.assertEqual(detail["leave_penalty"], LEAVE_PENALTY_PLANNING)
        self.trip.status = "active"
        self.trip.save()
        detail = self.client_for(self.friend).get(f"/api/trips/{self.trip.id}/").data
        self.assertEqual(detail["leave_penalty"], LEAVE_PENALTY_LIVE)
        # The owner can't leave, so there's nothing to show them.
        self.assertIsNone(self.client_for(self.owner).get(f"/api/trips/{self.trip.id}/").data["leave_penalty"])

    def test_leaving_before_the_trip_starts_costs_a_little_and_tells_the_organiser(self):
        self.a1.assigned_to = self.friend
        self.a1.save()

        response = self.leave(self.friend)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["xp_penalty"], LEAVE_PENALTY_PLANNING)

        self.friend.refresh_from_db()
        self.assertEqual(self.friend.xp, 50 + LEAVE_PENALTY_PLANNING)
        self.assertFalse(TripMember.objects.filter(trip=self.trip, user=self.friend).exists())
        self.a1.refresh_from_db()
        self.assertIsNone(self.a1.assigned_to)
        self.assertTrue(Notification.objects.filter(user=self.owner, kind="trip_left").exists())

    def test_leaving_a_live_trip_costs_a_bit_more(self):
        self.trip.status = "active"
        self.trip.save()
        self.leave(self.friend)
        self.friend.refresh_from_db()
        self.assertEqual(self.friend.xp, 50 + LEAVE_PENALTY_LIVE)

    def test_leaving_a_cancelled_trip_is_free(self):
        self.trip.status = "cancelled"
        self.trip.save()
        self.assertEqual(self.leave(self.friend).status_code, 200)
        self.friend.refresh_from_db()
        self.assertEqual(self.friend.xp, 50)

    def test_the_owner_cannot_leave_and_nobody_leaves_a_finished_trip(self):
        self.assertEqual(self.leave(self.owner).status_code, 400)
        self.trip.status = "completed"
        self.trip.save()
        self.assertEqual(self.leave(self.friend).status_code, 400)
        self.assertTrue(TripMember.objects.filter(trip=self.trip, user=self.friend).exists())
