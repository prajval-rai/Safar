"""Each traveller chooses whether a trip shows on their own profile map."""

from trips.models import TripMember
from trips.tests import SafarTestCase


class ProfileMapTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.trip.status = "completed"
        self.trip.latitude, self.trip.longitude = 15.5, 73.8
        self.trip.save()

    def areas(self, target, viewer=None):
        res = self.client_for(viewer or self.stranger).get(f"/api/users/{target.username}/travel-map/")
        return [a["trip_id"] for a in res.data["areas"]]

    def show(self, user, value):
        return self.client_for(user).post(
            f"/api/trips/{self.trip.id}/profile-map/", {"show": value}, format="json"
        )

    def test_hidden_by_default_and_each_member_decides_for_themselves(self):
        trip_id = str(self.trip.id)
        self.assertNotIn(trip_id, self.areas(self.friend))
        # A regular member (not an organiser) can put it on their own map…
        self.assertEqual(self.show(self.friend, True).status_code, 200)
        self.assertIn(trip_id, self.areas(self.friend))
        # …which doesn't put it on anyone else's.
        self.assertNotIn(trip_id, self.areas(self.owner))
        self.show(self.friend, False)
        self.assertNotIn(trip_id, self.areas(self.friend))

    def test_you_always_see_your_own_trips(self):
        self.assertIn(str(self.trip.id), self.areas(self.friend, viewer=self.friend))

    def test_trip_detail_reports_my_choice(self):
        url = f"/api/trips/{self.trip.id}/"
        self.assertFalse(self.client_for(self.friend).get(url).data["my_show_on_map"])
        self.show(self.friend, True)
        self.assertTrue(self.client_for(self.friend).get(url).data["my_show_on_map"])

    def test_owner_choice_is_the_default_for_people_who_join_later(self):
        self.show(self.owner, True)
        self.trip.refresh_from_db()
        self.assertTrue(self.trip.is_public)
        newcomer = TripMember.objects.create(trip=self.trip, user=self.stranger)
        self.assertTrue(newcomer.show_on_map)

    def test_strangers_cannot_change_it(self):
        self.assertEqual(self.show(self.stranger, True).status_code, 404)
