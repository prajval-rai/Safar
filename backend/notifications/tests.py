from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from explore.models import Track
from rewards.services import evaluate_achievements, seed_achievements
from trips.models import Day, Trip, TripMember

from .models import Notification

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
