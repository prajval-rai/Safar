"""Chat messages push to the rest of the group — without spamming them."""

from datetime import timedelta
from unittest import mock

from django.utils import timezone

from notifications.models import Notification
from trips.models import TripMember
from trips.tests import SafarTestCase


class ChatPushTests(SafarTestCase):
    def setUp(self):
        super().setUp()
        self.web = mock.patch("notifications.services.push_to_user").start()
        self.expo = mock.patch("notifications.services.push_to_expo_tokens").start()
        self.addCleanup(mock.patch.stopall)

    def send(self, user, text="reached the station 🚉"):
        return self.client_for(user).post(f"/api/trips/{self.trip.id}/chat/", {"text": text}, format="json")

    def test_everyone_else_gets_a_push_with_the_message(self):
        self.assertEqual(self.send(self.owner).status_code, 201)
        self.web.assert_called_once()
        user, title, body = self.web.call_args.args
        self.assertEqual(user, self.friend)
        self.assertEqual(title, "Owner · Goa Weekend")
        self.assertEqual(body, "reached the station 🚉")
        self.assertEqual(self.web.call_args.kwargs["url"], f"/trips/{self.trip.id}?tab=chat")
        self.expo.assert_called_once()
        self.assertTrue(Notification.objects.filter(user=self.friend, kind="chat_message").exists())
        # Never the sender.
        self.assertFalse(Notification.objects.filter(user=self.owner, kind="chat_message").exists())

    def test_a_burst_is_one_push_and_one_bell_entry_that_counts_up(self):
        for text in ("one", "two", "three"):
            self.send(self.owner, text)
        self.assertEqual(self.web.call_count, 1)
        note = Notification.objects.get(user=self.friend, kind="chat_message")
        self.assertEqual(note.count, 3)
        self.assertEqual(note.title, "3 new messages in Goa Weekend")
        self.assertEqual(note.body, "Owner: three")

    def test_after_the_cooldown_it_pushes_again(self):
        self.send(self.owner, "one")
        TripMember.objects.filter(trip=self.trip, user=self.friend).update(
            chat_pushed_at=timezone.now() - timedelta(minutes=5)
        )
        self.send(self.owner, "two")
        self.assertEqual(self.web.call_count, 2)

    def test_nobody_is_pushed_while_they_have_the_chat_open(self):
        # The friend's chat is open — it polls.
        self.client_for(self.friend).get(f"/api/trips/{self.trip.id}/chat/")
        self.send(self.owner)
        self.web.assert_not_called()
        self.assertFalse(Notification.objects.filter(user=self.friend, kind="chat_message").exists())

    def test_opening_the_chat_marks_its_bell_entry_read(self):
        self.send(self.owner)
        TripMember.objects.filter(trip=self.trip, user=self.friend).update(chat_seen_at=None)
        self.client_for(self.friend).get(f"/api/trips/{self.trip.id}/chat/")
        self.assertTrue(Notification.objects.get(user=self.friend, kind="chat_message").read)
