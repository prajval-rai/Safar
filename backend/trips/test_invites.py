"""Adding someone to a trip sends an invite; they're only on it once they accept."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from notifications.models import Notification
from trips.models import Trip, TripInvite, TripMember

User = get_user_model()


class TripInviteTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner", password="x", display_name="Owner")
        self.friend = User.objects.create_user("friend", password="x", display_name="Friend")
        self.stranger = User.objects.create_user("stranger", password="x")
        self.trip = Trip.objects.create(
            title="Goa",
            destination="Goa",
            start_date=date.today() + timedelta(days=3),
            end_date=date.today() + timedelta(days=5),
            created_by=self.owner,
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role="owner")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def invite(self):
        return self.client_for(self.owner).post(
            f"/api/trips/{self.trip.id}/members/", {"user_id": self.friend.id}, format="json"
        )

    def test_inviting_sends_a_request_not_a_membership(self):
        self.assertEqual(self.invite().status_code, 201)
        self.assertFalse(self.trip.members.filter(user=self.friend).exists())
        self.assertEqual(Notification.objects.get(user=self.friend).kind, "trip_invite")

        mine = self.client_for(self.friend).get("/api/invites/").data
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["trip"]["title"], "Goa")
        self.assertEqual(mine[0]["invited_by"]["username"], "owner")
        self.assertNotIn("join_code", mine[0]["trip"])

        detail = self.client_for(self.owner).get(f"/api/trips/{self.trip.id}/").data
        self.assertEqual([p["user"]["username"] for p in detail["pending_invites"]], ["friend"])

    def test_accepting_joins_the_trip_and_tells_the_organiser(self):
        invite_id = self.invite().data["id"]
        response = self.client_for(self.friend).post(f"/api/invites/{invite_id}/accept/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.trip.members.filter(user=self.friend).exists())
        self.assertEqual(self.client_for(self.friend).get("/api/invites/").data, [])
        self.assertTrue(Notification.objects.filter(user=self.owner, kind="trip_joined").exists())

    def test_declining_closes_it_without_joining(self):
        invite_id = self.invite().data["id"]
        self.assertEqual(self.client_for(self.friend).post(f"/api/invites/{invite_id}/decline/").status_code, 200)
        self.assertFalse(self.trip.members.filter(user=self.friend).exists())
        self.assertEqual(TripInvite.objects.get(pk=invite_id).status, "declined")
        # Answered already — can't flip it afterwards.
        self.assertEqual(self.client_for(self.friend).post(f"/api/invites/{invite_id}/accept/").status_code, 404)

    def test_only_the_invitee_can_answer(self):
        invite_id = self.invite().data["id"]
        self.assertEqual(self.client_for(self.stranger).post(f"/api/invites/{invite_id}/accept/").status_code, 404)
        self.assertEqual(self.client_for(self.friend).post(f"/api/invites/{invite_id}/maybe/").status_code, 404)

    def test_someone_already_on_the_trip_cant_be_invited(self):
        TripMember.objects.create(trip=self.trip, user=self.friend)
        self.assertEqual(self.invite().status_code, 400)

    def test_joining_with_the_code_answers_the_invite(self):
        invite_id = self.invite().data["id"]
        self.client_for(self.friend).post("/api/trips/join/", {"code": self.trip.join_code})
        self.assertEqual(TripInvite.objects.get(pk=invite_id).status, "accepted")
