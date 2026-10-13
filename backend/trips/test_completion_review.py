"""No signal at the stops: the organiser asks an admin to complete the trip,
with its photos as proof."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model

from notifications.models import Notification
from rewards.services import TRIP_COMPLETE_BONUS
from trips.models import Memory, StopCheckIn, TripMember
from trips.tests import SafarTestCase

User = get_user_model()


class CompletionReviewTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user("boss", password="x", is_staff=True, display_name="Boss")
        self.trip.start_date = date.today() - timedelta(days=2)
        self.trip.end_date = date.today() - timedelta(days=1)
        self.trip.status = "active"
        self.trip.save()

    def add_photos(self, user, n):
        for i in range(n):
            Memory.objects.create(trip=self.trip, user=user, image_url=f"https://example.com/{user.pk}-{i}.jpg")

    def ask(self, user=None, note=""):
        return self.client_for(user or self.owner).post(
            f"/api/trips/{self.trip.id}/request-completion/", {"note": note}, format="json"
        )

    def review(self, decision, note=""):
        return self.client_for(self.admin).post(
            f"/api/admin/completion-requests/{self.trip.id}/review/", {"decision": decision, "note": note}, format="json"
        )

    def test_it_needs_photos_and_an_organiser(self):
        self.assertEqual(self.ask(self.friend).status_code, 403)
        response = self.ask()
        self.assertEqual(response.status_code, 400)
        self.assertIn("photos", str(response.data["detail"]))

    def test_not_before_the_trip_starts(self):
        self.trip.start_date = date.today() + timedelta(days=3)
        self.trip.end_date = date.today() + timedelta(days=4)
        self.trip.status = "planning"
        self.trip.save()
        self.add_photos(self.owner, 3)
        self.assertEqual(self.ask().status_code, 400)

    def test_asking_puts_it_in_the_admin_queue(self):
        self.add_photos(self.owner, 3)
        response = self.ask(note="No signal in the hills")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["completion_review"]["status"], "pending")
        self.assertTrue(Notification.objects.filter(user=self.admin, kind="completion_submitted").exists())

        queue = self.client_for(self.admin).get("/api/admin/completion-requests/").data
        self.assertEqual(queue["counts"]["pending"], 1)
        row = queue["results"][0]
        self.assertEqual(row["review_status"], "pending")
        self.assertEqual(row["story"]["text"], "No signal in the hills")
        self.assertEqual(len(row["photos"]), 3)
        # Not again while it's waiting.
        self.assertEqual(self.ask().status_code, 400)

    def test_approving_completes_it_and_pays_whoever_added_photos(self):
        self.add_photos(self.owner, 3)
        self.ask()
        self.assertEqual(self.review("approve", "Looks right").status_code, 200)

        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, "completed")
        self.assertEqual(self.trip.completion_review_status, "approved")
        self.assertFalse(self.trip.days.filter(activities__status="planned").exists())
        # The organiser added photos, so they count as there; the friend didn't.
        self.assertTrue(StopCheckIn.objects.filter(user=self.owner, activity=self.a1).exists())
        self.assertFalse(StopCheckIn.objects.filter(user=self.friend).exists())
        owner = TripMember.objects.get(trip=self.trip, user=self.owner)
        friend = TripMember.objects.get(trip=self.trip, user=self.friend)
        self.assertEqual(owner.completion_xp, TRIP_COMPLETE_BONUS)
        self.assertEqual(friend.completion_xp, 0)
        self.assertTrue(Notification.objects.filter(user=self.friend, kind="completion_reviewed").exists())

    def test_rejecting_needs_a_note_and_lets_them_ask_again(self):
        self.add_photos(self.owner, 3)
        self.ask()
        self.assertEqual(self.review("reject").status_code, 400)
        self.assertEqual(self.review("reject", "Photos are from another place").status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.completion_review_status, "rejected")
        self.assertEqual(self.trip.status, "active")
        note = Notification.objects.get(user=self.owner, kind="completion_reviewed")
        self.assertIn("another place", note.body)
        self.assertEqual(self.ask().status_code, 200)

    def test_only_admins_can_review(self):
        self.add_photos(self.owner, 3)
        self.ask()
        response = self.client_for(self.friend).post(
            f"/api/admin/completion-requests/{self.trip.id}/review/", {"decision": "approve"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_an_approval_can_be_taken_back_to_pending(self):
        self.add_photos(self.owner, 3)
        self.ask()
        self.review("approve")
        self.owner.refresh_from_db()
        approved_xp = self.owner.xp
        self.assertGreater(approved_xp, 0)

        response = self.review("reopen")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["review_status"], "pending")
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.completion_review_status, "pending")
        self.assertNotEqual(self.trip.status, "completed")
        # The stops it ticked off are planned again, its check-ins are gone,
        # and the completion XP went back.
        self.assertFalse(self.trip.days.filter(activities__status="completed").exists())
        self.assertFalse(StopCheckIn.objects.filter(activity__day__trip=self.trip).exists())
        owner = TripMember.objects.get(trip=self.trip, user=self.owner)
        self.assertEqual(owner.completion_xp, 0)
        self.owner.refresh_from_db()
        self.assertLess(self.owner.xp, approved_xp)

        # …and it can be decided again.
        self.assertEqual(self.review("reject", "Not enough proof").status_code, 200)
        self.assertEqual(self.review("reopen").status_code, 200)
        self.assertEqual(self.review("approve").status_code, 200)

    def test_reopening_something_already_pending_is_refused(self):
        self.add_photos(self.owner, 3)
        self.ask()
        self.assertEqual(self.review("reopen").status_code, 400)
