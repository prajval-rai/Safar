"""Completion XP waits for anyone who still owes money on the trip."""

from notifications.models import Notification
from rewards.models import HeldXP
from rewards.services import ORGANIZER_COMPLETE_BONUS, TRIP_COMPLETE_BONUS
from trips.models import Expense
from trips.tests import SafarTestCase


class HeldXPTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        # The owner paid ₹1,000 for two people, so the friend owes ₹500.
        self.hotel = Expense.objects.create(trip=self.trip, title="Hotel", amount=1000, paid_by=self.owner)

    def finish(self):
        client = self.client_for(self.owner)
        response = None
        for activity in (self.a1, self.a2, self.a3):
            response = client.post(f"/api/activities/{activity.id}/complete/")
        return response

    def xp(self, user):
        user.refresh_from_db()
        return user.xp

    def test_whoever_owes_has_their_completion_xp_held(self):
        self.finish()
        held = HeldXP.objects.get(user=self.friend, released_at=None)
        self.assertEqual(held.amount, TRIP_COMPLETE_BONUS)
        # The owner paid, so owes nothing: both bonuses land straight away.
        self.assertFalse(HeldXP.objects.filter(user=self.owner).exists())
        detail = self.client_for(self.friend).get(f"/api/trips/{self.trip.id}/").data
        self.assertEqual(detail["my_held_xp"], TRIP_COMPLETE_BONUS)

    def test_the_completer_is_told_when_their_own_xp_is_held(self):
        # This time the owner is the one who owes.
        self.hotel.paid_by = self.friend
        self.hotel.save()
        response = self.finish()
        self.assertEqual(response.data["xp_held"], TRIP_COMPLETE_BONUS + ORGANIZER_COMPLETE_BONUS)

    def test_settling_up_releases_it(self):
        self.finish()
        before = self.xp(self.friend)
        paid = self.client_for(self.friend).post(
            f"/api/trips/{self.trip.id}/settle/", {"to_user_id": self.owner.id, "amount": 500}, format="json"
        )
        # Saying "I've paid" isn't enough — it has to be confirmed.
        self.assertEqual(self.xp(self.friend), before)
        self.client_for(self.owner).post(f"/api/trips/{self.trip.id}/settlements/{paid.data['id']}/confirm/")

        self.assertEqual(self.xp(self.friend), before + TRIP_COMPLETE_BONUS)
        self.assertFalse(HeldXP.objects.filter(user=self.friend, released_at=None).exists())
        self.assertTrue(Notification.objects.filter(user=self.friend, kind="xp_released").exists())

    def test_cash_recorded_by_the_receiver_releases_it_too(self):
        self.finish()
        before = self.xp(self.friend)
        self.client_for(self.owner).post(
            f"/api/trips/{self.trip.id}/settle/",
            {"from_user_id": self.friend.id, "amount": 500, "method": "cash"},
            format="json",
        )
        self.assertEqual(self.xp(self.friend), before + TRIP_COMPLETE_BONUS)

    def test_undoing_the_last_stop_drops_held_xp_without_charging_for_it(self):
        self.finish()
        before = self.xp(self.friend)
        self.client_for(self.owner).post(f"/api/activities/{self.a3.id}/undo/")
        self.assertFalse(HeldXP.objects.filter(user=self.friend).exists())
        # Only the stop and day XP come back off — not a bonus they never got.
        self.assertEqual(self.xp(self.friend), before - self.a3.xp_value - 5)

    def test_only_an_organiser_can_change_or_remove_an_expense(self):
        # Even the person who paid can't change it once it's in.
        mine = Expense.objects.create(trip=self.trip, title="Cab", amount=300, paid_by=self.friend)
        friend = self.client_for(self.friend)
        self.assertEqual(friend.patch(f"/api/expenses/{mine.id}/", {"amount": 1}, format="json").status_code, 403)
        self.assertEqual(friend.delete(f"/api/expenses/{self.hotel.id}/").status_code, 403)
        self.assertTrue(Expense.objects.filter(pk=self.hotel.pk).exists())

        owner = self.client_for(self.owner)
        edited = owner.patch(
            f"/api/expenses/{mine.id}/", {"title": "Airport cab", "amount": 450}, format="json"
        )
        self.assertEqual(edited.status_code, 200)
        self.assertEqual((edited.data["title"], edited.data["amount"]), ("Airport cab", 450))
        self.assertEqual(
            owner.patch(f"/api/expenses/{mine.id}/", {"paid_by_id": self.stranger.id}, format="json").status_code, 400
        )
        self.assertEqual(owner.delete(f"/api/expenses/{self.hotel.id}/").status_code, 204)

    def test_an_expense_can_only_be_paid_by_someone_on_the_trip(self):
        response = self.client_for(self.owner).post(
            f"/api/trips/{self.trip.id}/expenses/",
            {"title": "Fuel", "amount": 500, "paid_by_id": self.stranger.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_nothing_is_held_when_nobody_owes(self):
        self.hotel.delete()
        self.finish()
        self.assertFalse(HeldXP.objects.exists())
