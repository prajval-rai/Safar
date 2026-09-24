"""Settling up: who pays whom, UPI links, and paid → confirmed."""

from django.contrib.auth import get_user_model

from notifications.models import Notification
from trips.models import Expense, Settlement, TripMember
from trips.settle import suggested_transfers, upi_link
from trips.tests import SafarTestCase

User = get_user_model()


class SuggestedTransfersTests(SafarTestCase):
    def test_everyone_is_squared_up_in_few_payments(self):
        a, b, c = object(), object(), object()
        transfers = suggested_transfers(
            [{"user": a, "balance": 1200}, {"user": b, "balance": -800}, {"user": c, "balance": -400}]
        )
        self.assertEqual(
            [(t["from"], t["to"], t["amount"]) for t in transfers], [(b, a, 800), (c, a, 400)]
        )

    def test_nothing_to_do_when_even(self):
        self.assertEqual(suggested_transfers([{"user": 1, "balance": 0}, {"user": 2, "balance": 0}]), [])

    def test_upi_link_has_payee_amount_and_note(self):
        link = upi_link("rahul@okaxis", "Rahul Sharma", 800, "Safar: Goa Weekend")
        self.assertTrue(link.startswith("upi://pay?pa=rahul@okaxis&pn=Rahul%20Sharma&am=800.00&cu=INR"))
        self.assertIn("tn=Safar%3A%20Goa%20Weekend", link)


class SettleUpTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        # Owner paid ₹1,600 for a two-person trip: the friend owes ₹800.
        Expense.objects.create(trip=self.trip, title="Hotel", amount=1600, paid_by=self.owner)
        self.owner.upi_id = "owner@okaxis"
        self.owner.save()

    def settle(self, user):
        return self.client_for(user).get(f"/api/trips/{self.trip.id}/settle/").data

    def test_the_debtor_sees_who_to_pay_with_a_upi_link(self):
        transfer = self.settle(self.friend)["transfers"][0]
        self.assertEqual(transfer["from_user"]["username"], "friend")
        self.assertEqual(transfer["to_user"]["username"], "owner")
        self.assertEqual(transfer["amount"], 800)
        self.assertEqual(transfer["to_upi_id"], "owner@okaxis")
        self.assertIn("am=800.00", transfer["upi_link"])
        self.assertIsNone(transfer["pending"])

    def test_paid_then_confirmed_squares_the_balance(self):
        client = self.client_for(self.friend)
        paid = client.post(
            f"/api/trips/{self.trip.id}/settle/", {"to_user_id": self.owner.id, "amount": 800}, format="json"
        )
        self.assertEqual(paid.status_code, 201)
        self.assertEqual(paid.data["status"], "pending")
        self.assertTrue(Notification.objects.filter(user=self.owner, kind="settle_paid").exists())
        # Still owed until the owner confirms — shown as waiting, not as a fresh debt.
        self.assertEqual(self.settle(self.friend)["transfers"][0]["pending"]["amount"], 800)

        # Only the receiver can confirm.
        url = f"/api/trips/{self.trip.id}/settlements/{paid.data['id']}/confirm/"
        self.assertEqual(client.post(url).status_code, 403)
        self.assertEqual(self.client_for(self.owner).post(url).status_code, 200)

        self.assertEqual(self.settle(self.friend)["transfers"], [])
        balances = self.client_for(self.friend).get(f"/api/trips/{self.trip.id}/expenses/").data["balances"]
        self.assertTrue(all(b["balance"] == 0 for b in balances))
        self.assertTrue(Notification.objects.filter(user=self.friend, kind="settle_confirmed").exists())

    def test_declining_removes_the_claim(self):
        paid = self.client_for(self.friend).post(
            f"/api/trips/{self.trip.id}/settle/", {"to_user_id": self.owner.id, "amount": 800}, format="json"
        )
        url = f"/api/trips/{self.trip.id}/settlements/{paid.data['id']}/decline/"
        self.assertEqual(self.client_for(self.owner).post(url).status_code, 204)
        self.assertFalse(Settlement.objects.exists())
        self.assertEqual(self.settle(self.friend)["transfers"][0]["amount"], 800)

    def test_the_receiver_can_record_cash_straight_away(self):
        response = self.client_for(self.owner).post(
            f"/api/trips/{self.trip.id}/settle/",
            {"from_user_id": self.friend.id, "amount": 800, "method": "cash"},
            format="json",
        )
        self.assertEqual(response.data["status"], "confirmed")
        self.assertEqual(self.settle(self.owner)["transfers"], [])

    def test_bad_payments_are_refused(self):
        client = self.client_for(self.friend)
        url = f"/api/trips/{self.trip.id}/settle/"
        self.assertEqual(client.post(url, {"to_user_id": self.friend.id, "amount": 10}, format="json").status_code, 400)
        self.assertEqual(client.post(url, {"to_user_id": self.stranger.id, "amount": 10}, format="json").status_code, 400)
        self.assertEqual(client.post(url, {"to_user_id": self.owner.id, "amount": 0}, format="json").status_code, 400)
        self.assertEqual(
            self.client_for(self.stranger).post(url, {"to_user_id": self.owner.id, "amount": 5}, format="json").status_code,
            404,
        )

    def test_upi_id_is_validated_and_only_shown_on_your_own_account(self):
        client = self.client_for(self.friend)
        self.assertEqual(client.patch("/api/auth/me/", {"upi_id": "not a upi"}, format="json").status_code, 400)
        ok = client.patch("/api/auth/me/", {"upi_id": "  Friend.Travels@OKHDFCBANK "}, format="json")
        self.assertEqual(ok.data["upi_id"], "friend.travels@okhdfcbank")
        profile = self.client_for(self.stranger).get("/api/users/friend/").data
        self.assertNotIn("upi_id", str(profile))
