"""Logging a past trip: build it, add photos, submit, and an admin reviews it."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from explore.models import TravelPost
from notifications.models import Notification
from trips.models import Activity, PastTripConfig, Trip
from trips.tests import SafarTestCase, User


class PastTripTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user("boss", password="safar1234", is_staff=True)
        self.admin2 = User.objects.create_user("boss2", password="safar1234", is_staff=True)
        self.config = PastTripConfig.current()
        self.config.min_photos = 2
        self.config.save()

    def create(self, user=None, **extra):
        end = timezone.localdate() - timedelta(days=30)
        payload = {
            "title": "Manali last winter",
            "destination": "Manali",
            "region": "Himachal Pradesh",
            "start_date": str(end - timedelta(days=2)),
            "end_date": str(end),
            "is_past": True,
            **extra,
        }
        return self.client_for(user or self.owner).post("/api/trips/", payload, format="json")

    def make_ready(self):
        res = self.create()
        self.assertEqual(res.status_code, 201, res.data)
        trip = Trip.objects.get(pk=res.data["id"])
        client = self.client_for(self.owner)
        day = trip.days.first()
        client.post(f"/api/days/{day.id}/activities/", {"title": "Solang Valley"}, format="json")
        for n in range(2):
            client.post(
                f"/api/trips/{trip.id}/memories/",
                {"image_url": f"https://example.com/manali-{n}.jpg", "caption": "Snow"},
                format="json",
            )
        return trip

    def submit(self, trip):
        return self.client_for(self.owner).post(f"/api/trips/{trip.id}/submit-review/")

    def review(self, trip, decision, note="", admin=None):
        return self.client_for(admin or self.admin).post(
            f"/api/admin/past-trips/{trip.id}/review/",
            {"decision": decision, "note": note},
            format="json",
        )

    # --- creating ------------------------------------------------------------

    def test_create_makes_a_draft_with_no_xp(self):
        self.owner.refresh_from_db()
        before = self.owner.xp
        res = self.create()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["xp_awarded"], 0)
        self.assertTrue(res.data["is_past"])
        self.assertEqual(res.data["review_status"], "draft")
        self.assertEqual(res.data["past_trip"]["review_status"], "draft")
        self.assertEqual(len(res.data["days"]), 3)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.xp, before)

    def test_dates_must_be_in_the_past_and_within_the_limit(self):
        today = timezone.localdate()
        self.assertEqual(self.create(start_date=str(today), end_date=str(today)).status_code, 400)
        self.config.max_age_days = 10
        self.config.save()
        self.assertEqual(self.create().status_code, 400)

    def test_switched_off_blocks_new_past_trips(self):
        self.config.enabled = False
        self.config.save()
        self.assertEqual(self.create().status_code, 400)

    def test_cannot_be_run_live_or_joined(self):
        trip = self.make_ready()
        client = self.client_for(self.owner)
        self.assertEqual(client.post(f"/api/trips/{trip.id}/start/").status_code, 400)
        self.assertEqual(client.post(f"/api/trips/{trip.id}/cancel/").status_code, 400)
        stop = Activity.objects.get(day__trip=trip)
        self.assertEqual(client.post(f"/api/activities/{stop.id}/complete/").status_code, 400)
        joined = self.client_for(self.friend).post(
            "/api/trips/join/", {"code": trip.join_code}, format="json"
        )
        self.assertEqual(joined.status_code, 400)

    def test_photos_earn_no_xp_and_can_be_removed_while_drafting(self):
        trip = self.make_ready()
        memory = trip.memories.first()
        self.assertFalse(self.owner.xp_transactions.filter(kind="photo").exists())
        res = self.client_for(self.owner).delete(f"/api/trips/{trip.id}/memories/{memory.id}/")
        self.assertEqual(res.status_code, 204)
        self.assertEqual(trip.memories.count(), 1)

    # --- submitting ----------------------------------------------------------

    def test_needs_enough_photos_to_submit(self):
        trip = self.make_ready()
        trip.memories.first().delete()
        res = self.submit(trip)
        self.assertEqual(res.status_code, 400)
        self.assertIn("photo", res.data["detail"])

    def test_submitting_notifies_every_admin_and_locks_the_trip(self):
        trip = self.make_ready()
        res = self.submit(trip)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["review_status"], "pending")
        for admin in (self.admin, self.admin2):
            self.assertTrue(
                Notification.objects.filter(user=admin, kind="past_trip_submitted", trip=trip).exists()
            )
        self.assertFalse(Notification.objects.filter(user=self.friend, kind="past_trip_submitted").exists())

        client = self.client_for(self.owner)
        edit = client.patch(f"/api/trips/{trip.id}/", {"title": "Changed"}, format="json")
        self.assertEqual(edit.status_code, 400)
        photo = client.post(
            f"/api/trips/{trip.id}/memories/", {"image_url": "https://example.com/x.jpg"}, format="json"
        )
        self.assertEqual(photo.status_code, 400)

        # Withdrawing unlocks it again.
        self.assertEqual(client.post(f"/api/trips/{trip.id}/withdraw-review/").status_code, 200)
        edit = client.patch(f"/api/trips/{trip.id}/", {"title": "Changed"}, format="json")
        self.assertEqual(edit.status_code, 200)

    def test_story_needed_when_the_rules_say_so(self):
        self.config.require_story = True
        self.config.min_story_chars = 20
        self.config.save()
        trip = self.make_ready()
        self.assertEqual(self.submit(trip).status_code, 400)
        client = self.client_for(self.owner)
        story = client.post(
            f"/api/trips/{trip.id}/experience/",
            {"text": "Snowball fights at Solang and maggi at the top.", "is_public": True},
            format="json",
        )
        self.assertEqual(story.status_code, 201, story.data)
        # Written, but not on the Feed until it's approved.
        self.assertFalse(TravelPost.objects.filter(trip=trip).exists())
        self.assertEqual(self.submit(trip).status_code, 200)

    # --- reviewing -----------------------------------------------------------

    def test_only_admins_review(self):
        trip = self.make_ready()
        self.submit(trip)
        self.assertEqual(self.review(trip, "approve", admin=self.friend).status_code, 403)
        self.assertEqual(self.client_for(self.friend).get("/api/admin/past-trips/").status_code, 403)
        queue = self.client_for(self.admin).get("/api/admin/past-trips/")
        self.assertEqual(queue.data["counts"]["pending"], 1)
        self.assertEqual(queue.data["results"][0]["photo_count"], 2)

    def test_approval_completes_the_trip_pays_xp_and_shares_a_public_story(self):
        trip = self.make_ready()
        self.client_for(self.owner).post(
            f"/api/trips/{trip.id}/experience/",
            {"text": "Snowball fights at Solang and maggi at the top.", "is_public": True},
            format="json",
        )
        self.submit(trip)
        self.owner.refresh_from_db()
        before = self.owner.xp

        res = self.review(trip, "approve", "Lovely photos!")
        self.assertEqual(res.status_code, 200, res.data)
        trip.refresh_from_db()
        self.assertEqual(trip.status, "completed")
        self.assertEqual(trip.review_status, "approved")
        self.assertFalse(Activity.objects.filter(day__trip=trip).exclude(status="completed").exists())
        self.assertTrue(TravelPost.objects.filter(trip=trip, author=self.owner).exists())
        self.assertTrue(
            Notification.objects.filter(user=self.owner, kind="past_trip_reviewed", trip=trip).exists()
        )
        self.owner.refresh_from_db()
        paid = self.config.approval_xp + self.config.story_xp
        self.assertGreaterEqual(self.owner.xp, before + paid)
        # Approval is final: it can't be reviewed (or paid) twice.
        self.assertEqual(self.review(trip, "approve").status_code, 400)

    def test_private_story_stays_off_the_feed(self):
        trip = self.make_ready()
        self.client_for(self.owner).post(
            f"/api/trips/{trip.id}/experience/",
            {"text": "Just for me — the quiet mornings in Old Manali.", "is_public": False},
            format="json",
        )
        self.submit(trip)
        self.review(trip, "approve")
        self.assertFalse(TravelPost.objects.filter(trip=trip).exists())

    def test_rejection_needs_a_note_and_the_trip_can_be_resubmitted(self):
        trip = self.make_ready()
        self.submit(trip)
        self.assertEqual(self.review(trip, "reject").status_code, 400)
        res = self.review(trip, "reject", "These look like stock photos.")
        self.assertEqual(res.status_code, 200)
        trip.refresh_from_db()
        self.assertEqual(trip.review_status, "rejected")
        self.assertEqual(trip.status, "planning")
        note = Notification.objects.get(user=self.owner, kind="past_trip_reviewed")
        self.assertIn("stock", note.body)
        # They fix it and send it again.
        self.client_for(self.owner).post(
            f"/api/trips/{trip.id}/memories/",
            {"image_url": "https://example.com/me-at-rohtang.jpg"},
            format="json",
        )
        self.assertEqual(self.submit(trip).status_code, 200)

    def test_home_does_not_ask_about_an_approved_past_trip(self):
        trip = self.make_ready()
        self.submit(trip)
        self.review(trip, "approve")
        prompt = self.client_for(self.owner).get("/api/home/").data["experience_prompt"]
        self.assertTrue(prompt is None or prompt["trip"]["id"] != str(trip.id))

    # --- the rules -------------------------------------------------------------

    def test_admins_edit_the_rules_and_travellers_read_them(self):
        client = self.client_for(self.admin)
        res = client.patch(
            "/api/past-trips/config/", {"min_photos": 5, "approval_xp": "3.5"}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(PastTripConfig.current().min_photos, 5)
        self.assertEqual(PastTripConfig.current().approval_xp, Decimal("3.5"))
        self.assertEqual(self.client_for(self.friend).get("/api/past-trips/config/").data["min_photos"], 5)
        denied = self.client_for(self.friend).patch("/api/past-trips/config/", {"min_photos": 0}, format="json")
        self.assertEqual(denied.status_code, 403)
        bad = client.patch("/api/past-trips/config/", {"min_photos": 50, "max_photos": 10}, format="json")
        self.assertEqual(bad.status_code, 400)


class ExperienceVisibilityTests(SafarTestCase):
    """Any trip's story can be kept off the Feed."""

    def test_making_a_story_private_takes_it_off_the_feed(self):
        client = self.client_for(self.owner)
        for activity in (self.a1, self.a2, self.a3):
            client.post(f"/api/activities/{activity.id}/complete/")
        url = f"/api/trips/{self.trip.id}/experience/"
        client.post(url, {"text": "Loved every minute of the beach and the fort."}, format="json")
        self.assertTrue(TravelPost.objects.filter(trip=self.trip).exists())
        client.post(url, {"text": "Loved every minute of the beach and the fort.", "is_public": False}, format="json")
        self.assertFalse(TravelPost.objects.filter(trip=self.trip).exists())
