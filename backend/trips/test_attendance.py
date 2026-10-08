"""Stop XP goes to the people who were there, not to everyone on the trip —
joining a friend's trip from home earns nothing."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from rewards.services import (
    CHECKIN_XP,
    DAY_COMPLETE_BONUS,
    EXPERIENCE_XP,
    TRIP_COMPLETE_BONUS,
    as_xp,
)
from trips.models import Activity, StopCheckIn, TripMember
from trips.tests import BAGA, CALANGUTE, FORT_AGUADA, MUMBAI, SafarTestCase, forget_locations, leg_xp


class AttendanceTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        for activity, (lat, lng) in ((self.a1, BAGA), (self.a2, CALANGUTE), (self.a3, FORT_AGUADA)):
            activity.latitude, activity.longitude = lat, lng
            activity.save()
        self.organiser = self.client_for(self.owner)
        self.organiser.post(
            f"/api/trips/{self.trip.id}/start/",
            {"latitude": MUMBAI[0], "longitude": MUMBAI[1]},
            format="json",
        )
        forget_locations()

    def at(self, activity):
        return {"latitude": activity.latitude, "longitude": activity.longitude, "accuracy": 10}

    def complete(self, activity):
        return self.organiser.post(f"/api/activities/{activity.id}/complete/", self.at(activity), format="json")

    def check_in(self, user, activity, body=None):
        return self.client_for(user).post(
            f"/api/activities/{activity.id}/checkin/", self.at(activity) if body is None else body, format="json"
        )

    def xp(self, user):
        user.refresh_from_db()
        return user.xp

    def test_a_friend_following_from_home_earns_nothing(self):
        for activity in (self.a1, self.a2, self.a3):
            self.complete(activity)

        self.assertEqual(self.xp(self.friend), 0)
        member = TripMember.objects.get(trip=self.trip, user=self.friend)
        self.assertEqual(member.completion_xp, 0)
        self.assertFalse(self.friend.achievements.exists())
        # The organiser was at every stop, so they earned the lot.
        organiser = TripMember.objects.get(trip=self.trip, user=self.owner)
        self.assertEqual(organiser.completion_xp, TRIP_COMPLETE_BONUS)

    def test_checking_in_is_per_person(self):
        self.assertEqual(self.check_in(self.owner, self.a1).status_code, 200)
        response = self.check_in(self.friend, self.a1)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("already_checked_in", response.data)
        self.assertEqual(response.data["xp_awarded"], CHECKIN_XP)
        self.assertEqual(self.a1.checkins.count(), 2)
        self.assertTrue(self.check_in(self.friend, self.a1).data["already_checked_in"])

    def test_checking_in_from_home_is_refused(self):
        response = self.check_in(self.friend, self.a1, {"latitude": MUMBAI[0], "longitude": MUMBAI[1]})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.a1.checkins.exists())

    def test_checking_in_before_the_stop_is_completed_earns_its_distance(self):
        self.check_in(self.friend, self.a1)
        before = self.xp(self.friend)
        self.complete(self.a1)
        self.assertEqual(self.xp(self.friend), before + leg_xp(MUMBAI, BAGA) + self.first_steps_bonus)

    def test_a_late_check_in_pays_the_stop_and_the_day(self):
        self.complete(self.a1)
        self.complete(self.a2)
        self.check_in(self.friend, self.a1)
        response = self.check_in(self.friend, self.a2)

        self.assertEqual(
            Decimal(str(response.data["xp_awarded"])),
            CHECKIN_XP + leg_xp(BAGA, CALANGUTE) + DAY_COMPLETE_BONUS,
        )
        self.assertTrue(self.trip.days.get(index=1).bonuses.filter(user=self.friend).exists())

    def test_a_late_check_in_after_the_trip_tops_up_the_completion_bonus(self):
        self.was_at(self.friend, self.a1, self.a2)
        for activity in (self.a1, self.a2, self.a3):
            self.complete(activity)
        member = TripMember.objects.get(trip=self.trip, user=self.friend)
        self.assertEqual(member.completion_xp, as_xp(TRIP_COMPLETE_BONUS * Decimal(2) / Decimal(3)))

        self.check_in(self.friend, self.a3)
        member.refresh_from_db()
        self.assertEqual(member.completion_xp, TRIP_COMPLETE_BONUS)

    def test_check_in_closes_a_day_after_the_stop_is_done(self):
        self.complete(self.a1)
        Activity.objects.filter(pk=self.a1.pk).update(completed_at=timezone.now() - timedelta(hours=25))
        response = self.check_in(self.friend, self.a1)
        self.assertEqual(response.status_code, 400)

    def test_each_person_gets_their_own_share_of_the_completion_bonus(self):
        self.was_at(self.friend, self.a1)
        for activity in (self.a1, self.a2, self.a3):
            self.complete(activity)
        member = TripMember.objects.get(trip=self.trip, user=self.friend)
        self.assertEqual(member.completion_xp, as_xp(TRIP_COMPLETE_BONUS / Decimal(3)))
        # And no day bonus: they missed a stop on day 1 and the only one on day 2.
        self.assertFalse(self.friend.day_bonuses.exists())

    def test_an_unpinned_stop_counts_only_after_checking_in_on_the_spot(self):
        self.a2.latitude = self.a2.longitude = None
        self.a2.save()
        self.complete(self.a1)
        self.complete(self.a2)

        # Tapping check-in at a stop with no pin needs no location...
        self.assertEqual(self.check_in(self.friend, self.a2, {}).status_code, 200)
        self.assertFalse(self.friend.day_bonuses.exists())
        # ...but it only counts once they've been somewhere on the trip for real.
        self.check_in(self.friend, self.a1)
        self.assertTrue(self.friend.day_bonuses.filter(day__index=1).exists())

    def test_undo_and_redo_pays_whoever_was_there_again(self):
        self.was_at(self.friend, self.a1)
        self.complete(self.a1)
        paid = self.xp(self.friend)
        self.organiser.post(f"/api/activities/{self.a1.id}/undo/")
        self.assertEqual(self.xp(self.friend), paid - leg_xp(MUMBAI, BAGA))
        self.assertTrue(StopCheckIn.objects.filter(activity=self.a1, user=self.friend).exists())

        self.complete(self.a1)
        self.assertEqual(self.xp(self.friend), paid)

    def test_writing_about_a_trip_you_were_not_on_pays_nothing(self):
        for activity in (self.a1, self.a2, self.a3):
            self.complete(activity)
        response = self.client_for(self.friend).post(
            f"/api/trips/{self.trip.id}/experience/", {"text": "Looked like a great trip!"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["xp_awarded"], 0)
        mine = self.organiser.post(
            f"/api/trips/{self.trip.id}/experience/", {"text": "Beach, lunch and the fort."}, format="json"
        )
        self.assertEqual(mine.data["xp_awarded"], EXPERIENCE_XP)
