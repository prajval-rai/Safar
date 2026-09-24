"""The 1 km rule for completing stops, and assignment."""

from django.contrib.auth import get_user_model

from trips.models import Activity, TripMember
from trips.tests import SafarTestCase

User = get_user_model()

# Baga Beach, Goa. Offsets: 0.008 degrees of latitude is ~0.9 km, 0.015 is ~1.7 km.
BAGA = (15.5553, 73.7517)
MUMBAI = (19.076, 72.8777)


class LocationCompletionTests(SafarTestCase):
    """A stop with a pin can only be completed by someone standing within 1 km of it."""

    def setUp(self):
        super().setUp()
        self.buddy = User.objects.create_user("buddy", password="safar1234", display_name="Buddy")
        TripMember.objects.create(trip=self.trip, user=self.buddy, role="member")
        self.pin = Activity.objects.create(
            day=self.day3,
            title="Baga Beach",
            place_name="Baga Beach",
            latitude=BAGA[0],
            longitude=BAGA[1],
        )

    def complete(self, user, **body):
        return self.client_for(user).post(
            f"/api/activities/{self.pin.id}/complete/", body, format="json"
        )

    def at(self, lat_offset=0.0, **extra):
        return {"latitude": BAGA[0] + lat_offset, "longitude": BAGA[1], **extra}

    def test_standing_at_the_stop_completes_it_and_verifies_the_visit(self):
        response = self.complete(self.owner, **self.at(0.0005, accuracy=20))
        self.assertEqual(response.status_code, 200)

        self.pin.refresh_from_db()
        self.assertEqual(self.pin.status, "completed")
        self.assertTrue(self.pin.verified_by_location)
        self.assertLess(self.pin.completed_distance_m, 100)

    def test_far_away_is_refused_with_a_friendly_distance(self):
        response = self.complete(self.owner, latitude=MUMBAI[0], longitude=MUMBAI[1])
        self.assertEqual(response.status_code, 400)
        message = str(response.data["detail"])
        self.assertIn("Baga Beach", message)
        self.assertIn("km", message)

        self.pin.refresh_from_db()
        self.assertEqual(self.pin.status, "planned")

    def test_the_boundary_is_one_kilometre(self):
        self.assertEqual(self.complete(self.owner, **self.at(0.015)).status_code, 400)  # ~1.7 km
        self.assertEqual(self.complete(self.owner, **self.at(0.008)).status_code, 200)  # ~0.9 km

    def test_location_is_required(self):
        response = self.complete(self.owner)
        self.assertEqual(response.status_code, 400)
        self.assertIn("location", str(response.data["detail"]).lower())

    def test_garbage_coordinates_are_rejected(self):
        self.assertEqual(self.complete(self.owner, latitude="abc", longitude="xyz").status_code, 400)
        self.assertEqual(self.complete(self.owner, latitude=999, longitude=10).status_code, 400)

    def test_a_vague_gps_fix_is_rejected_even_when_close(self):
        response = self.complete(self.owner, **self.at(0.0, accuracy=5000))
        self.assertEqual(response.status_code, 400)
        self.assertIn("accurate", str(response.data["detail"]))

    def test_there_is_no_override_for_the_distance(self):
        response = self.complete(self.owner, override=True)
        self.assertEqual(response.status_code, 400)
        self.pin.refresh_from_db()
        self.assertEqual(self.pin.status, "planned")

    def test_plain_members_cannot_complete_even_when_there(self):
        response = self.complete(self.friend, **self.at(0.0005))
        self.assertEqual(response.status_code, 403)
        self.pin.refresh_from_db()
        self.assertEqual(self.pin.status, "planned")

    def test_stops_without_a_pin_need_no_location(self):
        response = self.client_for(self.owner).post(f"/api/activities/{self.a1.id}/complete/")
        self.assertEqual(response.status_code, 200)
        self.a1.refresh_from_db()
        self.assertFalse(self.a1.verified_by_location)

    def test_checking_in_needs_you_to_be_there(self):
        client = self.client_for(self.friend)
        far = client.post(
            f"/api/activities/{self.pin.id}/checkin/",
            {"latitude": MUMBAI[0], "longitude": MUMBAI[1]},
            format="json",
        )
        self.assertEqual(far.status_code, 400)

        near = client.post(
            f"/api/activities/{self.pin.id}/checkin/", self.at(0.001), format="json"
        )
        self.assertEqual(near.status_code, 200)
        self.pin.refresh_from_db()
        self.assertIsNotNone(self.pin.checked_in_at)

    def test_undo_clears_the_verification(self):
        self.complete(self.owner, **self.at(0.001))
        self.client_for(self.owner).post(f"/api/activities/{self.pin.id}/undo/")
        self.pin.refresh_from_db()
        self.assertEqual(self.pin.status, "planned")
        self.assertFalse(self.pin.verified_by_location)

    def test_only_an_organiser_can_undo(self):
        self.complete(self.owner, **self.at(0.001))
        self.assertEqual(
            self.client_for(self.buddy).post(f"/api/activities/{self.pin.id}/undo/").status_code, 403
        )
        self.assertEqual(
            self.client_for(self.owner).post(f"/api/activities/{self.pin.id}/undo/").status_code, 200
        )


class AssignmentTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.buddy = User.objects.create_user("buddy", password="safar1234", display_name="Buddy")
        TripMember.objects.create(trip=self.trip, user=self.buddy, role="member")

    def assign(self, user, target):
        return self.client_for(user).post(
            f"/api/activities/{self.a1.id}/assign/", {"user_id": target}, format="json"
        )

    def test_organiser_assigns_a_stop_to_a_member(self):
        response = self.assign(self.owner, self.friend.id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["assigned_to"]["username"], "friend")

    def test_plain_members_cannot_assign(self):
        self.assertEqual(self.assign(self.friend, self.buddy.id).status_code, 403)

    def test_cannot_assign_to_someone_outside_the_trip(self):
        self.assertEqual(self.assign(self.owner, self.stranger.id).status_code, 400)

    def test_being_assigned_a_stop_does_not_let_a_member_complete_it(self):
        self.assign(self.owner, self.friend.id)
        response = self.client_for(self.friend).post(f"/api/activities/{self.a1.id}/complete/")
        self.assertEqual(response.status_code, 403)

    def test_organiser_can_complete_someone_elses_assigned_stop(self):
        self.assign(self.owner, self.friend.id)
        response = self.client_for(self.owner).post(f"/api/activities/{self.a1.id}/complete/")
        self.assertEqual(response.status_code, 200)

    def test_assigning_null_clears_it(self):
        self.assign(self.owner, self.friend.id)
        response = self.assign(self.owner, None)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["assigned_to"])

    def test_a_finished_stop_cannot_be_reassigned(self):
        self.client_for(self.owner).post(f"/api/activities/{self.a1.id}/complete/")
        self.assertEqual(self.assign(self.owner, self.friend.id).status_code, 400)
