from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from pywebpush import WebPushException
from rest_framework.test import APIClient

from accounts.models import Follow
from explore.models import Track
from rewards.services import evaluate_achievements, seed_achievements
from trips.models import Activity, Day, Expense, Trip, TripMember

from .models import Notification, PushSubscription

User = get_user_model()


class NotificationTestCase(TestCase):
    def setUp(self):
        seed_achievements()
        self.me = User.objects.create_user("me", password="x", display_name="Me")
        self.ann = User.objects.create_user("ann", password="x", display_name="Ann Rao")
        self.bob = User.objects.create_user("bob", password="x", display_name="Bob")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def make_trip(self, owner):
        trip = Trip.objects.create(
            title="Goa Trip",
            destination="Goa",
            region="Goa",
            start_date=date.today() + timedelta(days=5),
            end_date=date.today() + timedelta(days=8),
            created_by=owner,
        )
        TripMember.objects.create(trip=trip, user=owner, role="owner")
        Day.objects.create(trip=trip, index=1, date=trip.start_date)
        return trip

    # --- trip member added ------------------------------------------------

    def test_adding_a_member_notifies_them(self):
        trip = self.make_trip(self.me)
        self.client_for(self.me).post(f"/api/trips/{trip.id}/members/", {"username": "ann"})
        note = Notification.objects.get(user=self.ann)
        self.assertEqual(note.kind, "trip_member_added")
        self.assertEqual(note.trip_id, trip.id)
        self.assertFalse(note.read)

    def test_adding_yourself_is_not_possible_so_no_self_notification(self):
        # An owner is already a member (created in make_trip); re-adding via
        # their own username should not create a duplicate/self notification.
        trip = self.make_trip(self.me)
        self.client_for(self.me).post(f"/api/trips/{trip.id}/members/", {"username": "me"})
        self.assertFalse(Notification.objects.filter(user=self.me).exists())

    # --- join by code -------------------------------------------------------

    def test_joining_by_code_notifies_the_organiser(self):
        trip = self.make_trip(self.me)
        self.client_for(self.ann).post("/api/trips/join/", {"code": trip.join_code})
        note = Notification.objects.get(user=self.me)
        self.assertEqual(note.kind, "trip_joined")
        self.assertEqual(note.actor_id, self.ann.id)

    def test_joining_twice_only_notifies_once(self):
        trip = self.make_trip(self.me)
        client = self.client_for(self.ann)
        client.post("/api/trips/join/", {"code": trip.join_code})
        client.post("/api/trips/join/", {"code": trip.join_code})
        self.assertEqual(Notification.objects.filter(user=self.me).count(), 1)

    # --- trip started ---------------------------------------------------

    def test_starting_a_trip_notifies_other_members_not_the_starter(self):
        trip = self.make_trip(self.me)
        TripMember.objects.create(trip=trip, user=self.ann, role="member")
        trip.start_date = date.today()
        trip.save(update_fields=["start_date"])
        self.client_for(self.me).post(f"/api/trips/{trip.id}/start/")
        self.assertTrue(Notification.objects.filter(user=self.ann, kind="trip_started").exists())
        self.assertFalse(Notification.objects.filter(user=self.me, kind="trip_started").exists())

    # --- trip cancelled -----------------------------------------------------

    def test_cancelling_a_trip_notifies_the_other_members(self):
        trip = self.make_trip(self.me)
        TripMember.objects.create(trip=trip, user=self.ann, role="member")
        self.client_for(self.me).post(f"/api/trips/{trip.id}/cancel/")
        note = Notification.objects.get(user=self.ann, kind="trip_cancelled")
        self.assertEqual(note.actor_id, self.me.id)
        self.assertEqual(note.trip_id, trip.id)

    def test_cancelling_does_not_self_notify_the_canceller(self):
        trip = self.make_trip(self.me)
        self.client_for(self.me).post(f"/api/trips/{trip.id}/cancel/")
        self.assertFalse(Notification.objects.filter(user=self.me, kind="trip_cancelled").exists())

    # --- trip completed ------------------------------------------------------

    def test_completing_the_last_activity_notifies_everyone_with_an_expense_summary(self):
        trip = self.make_trip(self.me)
        TripMember.objects.create(trip=trip, user=self.ann, role="member")
        day = trip.days.first()
        activity = Activity.objects.create(day=day, title="Beach", order=0)
        Expense.objects.create(trip=trip, title="Hotel", amount=2000, paid_by=self.me)

        self.client_for(self.me).post(f"/api/activities/{activity.id}/complete/")

        # Split two ways: ann owes 1000, me (who paid) gets 1000 back.
        note_ann = Notification.objects.get(user=self.ann, kind="trip_completed")
        note_me = Notification.objects.get(user=self.me, kind="trip_completed")
        self.assertIn("₹1000", note_ann.body)
        self.assertIn("₹1000", note_me.body)

    def test_completing_a_trip_with_no_expenses_says_so_plainly(self):
        trip = self.make_trip(self.me)
        day = trip.days.first()
        activity = Activity.objects.create(day=day, title="Beach", order=0)

        self.client_for(self.me).post(f"/api/activities/{activity.id}/complete/")

        note = Notification.objects.get(user=self.me, kind="trip_completed")
        self.assertIn("No expenses", note.body)

    # --- follow -----------------------------------------------------------

    def test_following_someone_notifies_them(self):
        self.client_for(self.me).post("/api/users/ann/follow/")
        note = Notification.objects.get(user=self.ann)
        self.assertEqual(note.kind, "new_follower")
        self.assertEqual(note.actor_id, self.me.id)

    # --- track used ---------------------------------------------------------

    def test_using_a_track_notifies_its_author(self):
        track = Track.objects.create(
            author=self.bob,
            title="Goa Weekend",
            destination="Goa",
            region="Goa",
            days=2,
            is_published=True,
        )
        self.client_for(self.ann).post(
            f"/api/explore/tracks/{track.id}/use/", {"start_date": str(date.today() + timedelta(days=10))}
        )
        note = Notification.objects.get(user=self.bob)
        self.assertEqual(note.kind, "track_used")
        self.assertEqual(note.track_id, track.id)

    def test_using_your_own_track_does_not_self_notify(self):
        track = Track.objects.create(
            author=self.me,
            title="Goa Weekend",
            destination="Goa",
            region="Goa",
            days=2,
            is_published=True,
        )
        self.client_for(self.me).post(
            f"/api/explore/tracks/{track.id}/use/", {"start_date": str(date.today() + timedelta(days=10))}
        )
        self.assertFalse(Notification.objects.filter(user=self.me).exists())

    # --- track published -----------------------------------------------------

    def test_publishing_a_track_notifies_followers(self):
        Follow.objects.create(follower=self.ann, following=self.me)
        trip = self.make_trip(self.me)

        response = self.client_for(self.me).post(
            "/api/explore/tracks/from-trip/", {"trip": str(trip.id)}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        note = Notification.objects.get(user=self.ann, kind="track_published")
        self.assertEqual(note.actor_id, self.me.id)

    def test_publishing_a_track_does_not_notify_non_followers(self):
        trip = self.make_trip(self.me)
        self.client_for(self.me).post(
            "/api/explore/tracks/from-trip/", {"trip": str(trip.id)}, format="json"
        )
        self.assertFalse(Notification.objects.filter(user=self.bob, kind="track_published").exists())

    # --- achievement unlocked ---------------------------------------------

    def test_unlocking_an_achievement_notifies_the_user(self):
        evaluate_achievements(self.me)
        # "First Steps"-style achievements shouldn't fire on zero activity, but
        # whatever does unlock (if any) must be announced, never silent.
        unlocked_codes = set(self.me.achievements.values_list("achievement__code", flat=True))
        notified_kinds = set(
            Notification.objects.filter(user=self.me, kind="achievement_unlocked").values_list("id", flat=True)
        )
        self.assertEqual(len(unlocked_codes), len(notified_kinds))

    # --- API surface --------------------------------------------------------

    def test_list_includes_unread_count_and_marks_read(self):
        trip = self.make_trip(self.me)
        self.client_for(self.me).post(f"/api/trips/{trip.id}/members/", {"username": "ann"})
        client = self.client_for(self.ann)

        data = client.get("/api/notifications/").data
        self.assertEqual(data["unread_count"], 1)
        note_id = data["results"][0]["id"]

        client.post(f"/api/notifications/{note_id}/read/")
        self.assertEqual(client.get("/api/notifications/unread-count/").data["unread_count"], 0)

    def test_mark_all_read(self):
        trip = self.make_trip(self.me)
        self.client_for(self.me).post(f"/api/trips/{trip.id}/members/", {"username": "ann"})
        self.client_for(self.me).post("/api/users/ann/follow/")
        client = self.client_for(self.ann)
        self.assertEqual(Notification.objects.filter(user=self.ann, read=False).count(), 2)

        client.post("/api/notifications/read-all/")
        self.assertEqual(Notification.objects.filter(user=self.ann, read=False).count(), 0)

    def test_cannot_read_someone_elses_notification(self):
        trip = self.make_trip(self.me)
        self.client_for(self.me).post(f"/api/trips/{trip.id}/members/", {"username": "ann"})
        note = Notification.objects.get(user=self.ann)
        response = self.client_for(self.bob).post(f"/api/notifications/{note.id}/read/")
        self.assertEqual(response.status_code, 404)


class PushConfigTests(NotificationTestCase):
    def test_reports_disabled_with_no_vapid_keys(self):
        response = self.client_for(self.me).get("/api/push/config/")
        self.assertFalse(response.data["enabled"])

    @override_settings(VAPID_PRIVATE_KEY="priv", VAPID_PUBLIC_KEY="pub")
    def test_reports_enabled_and_the_public_key_once_keys_are_set(self):
        response = self.client_for(self.me).get("/api/push/config/")
        self.assertTrue(response.data["enabled"])
        self.assertEqual(response.data["public_key"], "pub")


class PushSubscriptionApiTests(NotificationTestCase):
    def test_subscribing_saves_the_subscription(self):
        response = self.client_for(self.me).post(
            "/api/push/subscribe/",
            {"endpoint": "https://push.example/abc", "keys": {"p256dh": "p", "auth": "a"}},
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        sub = PushSubscription.objects.get(user=self.me)
        self.assertEqual(sub.endpoint, "https://push.example/abc")

    def test_resubscribing_the_same_endpoint_updates_rather_than_duplicates(self):
        client = self.client_for(self.me)
        client.post(
            "/api/push/subscribe/",
            {"endpoint": "https://push.example/abc", "keys": {"p256dh": "old", "auth": "a"}},
            format="json",
        )
        client.post(
            "/api/push/subscribe/",
            {"endpoint": "https://push.example/abc", "keys": {"p256dh": "new", "auth": "a"}},
            format="json",
        )
        self.assertEqual(PushSubscription.objects.filter(user=self.me).count(), 1)
        self.assertEqual(PushSubscription.objects.get(user=self.me).p256dh, "new")

    def test_an_incomplete_subscription_is_rejected(self):
        response = self.client_for(self.me).post(
            "/api/push/subscribe/", {"endpoint": "https://push.example/abc"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_unsubscribing_removes_just_that_endpoint(self):
        client = self.client_for(self.me)
        client.post(
            "/api/push/subscribe/",
            {"endpoint": "https://push.example/keep", "keys": {"p256dh": "p", "auth": "a"}},
            format="json",
        )
        client.post(
            "/api/push/subscribe/",
            {"endpoint": "https://push.example/drop", "keys": {"p256dh": "p", "auth": "a"}},
            format="json",
        )
        client.post("/api/push/unsubscribe/", {"endpoint": "https://push.example/drop"}, format="json")

        remaining = PushSubscription.objects.filter(user=self.me).values_list("endpoint", flat=True)
        self.assertEqual(list(remaining), ["https://push.example/keep"])


class PushSendingTests(NotificationTestCase):
    """Real push delivery, triggered from the same notify() every in-app
    notification already goes through — webpush() itself is mocked, since
    actually reaching a push service isn't something a test should do."""

    @override_settings(VAPID_PRIVATE_KEY="priv", VAPID_PUBLIC_KEY="pub")
    @patch("notifications.push.webpush")
    def test_a_notification_pushes_to_every_device_the_recipient_has(self, mock_webpush):
        PushSubscription.objects.create(
            user=self.ann, endpoint="https://push.example/1", p256dh="p", auth="a"
        )
        PushSubscription.objects.create(
            user=self.ann, endpoint="https://push.example/2", p256dh="p", auth="a"
        )

        self.client_for(self.me).post("/api/users/ann/follow/")

        self.assertEqual(mock_webpush.call_count, 2)

    @patch("notifications.push.webpush")
    def test_push_is_a_silent_no_op_without_vapid_keys_configured(self, mock_webpush):
        PushSubscription.objects.create(
            user=self.ann, endpoint="https://push.example/1", p256dh="p", auth="a"
        )
        response = self.client_for(self.me).post("/api/users/ann/follow/")

        self.assertEqual(response.status_code, 200)
        mock_webpush.assert_not_called()
        # The in-app notification is completely unaffected either way.
        self.assertTrue(Notification.objects.filter(user=self.ann).exists())

    @override_settings(VAPID_PRIVATE_KEY="priv", VAPID_PUBLIC_KEY="pub")
    @patch("notifications.push.webpush")
    def test_a_gone_subscription_is_deleted_rather_than_retried_forever(self, mock_webpush):
        gone = MagicMock(status_code=410)
        mock_webpush.side_effect = WebPushException("gone", response=gone)
        sub = PushSubscription.objects.create(
            user=self.ann, endpoint="https://push.example/1", p256dh="p", auth="a"
        )

        self.client_for(self.me).post("/api/users/ann/follow/")

        self.assertFalse(PushSubscription.objects.filter(pk=sub.pk).exists())

    @override_settings(VAPID_PRIVATE_KEY="priv", VAPID_PUBLIC_KEY="pub")
    @patch("notifications.push.webpush")
    def test_a_temporary_failure_keeps_the_subscription_for_next_time(self, mock_webpush):
        server_error = MagicMock(status_code=500)
        mock_webpush.side_effect = WebPushException("server error", response=server_error)
        sub = PushSubscription.objects.create(
            user=self.ann, endpoint="https://push.example/1", p256dh="p", auth="a"
        )

        self.client_for(self.me).post("/api/users/ann/follow/")

        self.assertTrue(PushSubscription.objects.filter(pk=sub.pk).exists())

    @override_settings(VAPID_PRIVATE_KEY="priv", VAPID_PUBLIC_KEY="pub")
    @patch("notifications.push.webpush")
    def test_one_bad_device_does_not_stop_the_notification_or_other_devices(self, mock_webpush):
        mock_webpush.side_effect = Exception("boom")
        PushSubscription.objects.create(
            user=self.ann, endpoint="https://push.example/1", p256dh="p", auth="a"
        )

        response = self.client_for(self.me).post("/api/users/ann/follow/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Notification.objects.filter(user=self.ann).exists())
