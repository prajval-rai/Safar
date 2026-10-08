"""The notifications around a trip's money and its first and last days."""

from datetime import date, timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.utils import timezone

from notifications.models import Notification
from trips.models import Expense
from trips.tests import SafarTestCase


def at_hour(hour):
    """Pretend the local time is `hour`:00 today."""
    now = timezone.localtime().replace(hour=hour, minute=0, second=0, microsecond=0)
    return patch("trips.management.commands.send_trip_reminders.timezone.localtime", return_value=now)


class ExpenseNotificationTests(SafarTestCase):
    def test_adding_an_expense_tells_everyone_else_their_share(self):
        response = self.client_for(self.owner).post(
            f"/api/trips/{self.trip.id}/expenses/", {"title": "Dinner", "amount": 1200}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        note = Notification.objects.get(user=self.friend, kind="expense_added")
        self.assertIn("₹1,200", note.title)
        self.assertIn("Dinner", note.title)
        self.assertIn("₹600", note.body)
        # Not the person who added it.
        self.assertFalse(Notification.objects.filter(user=self.owner, kind="expense_added").exists())


class TripDayReminderTests(SafarTestCase):
    def test_morning_of_the_first_day_says_it_starts_today(self):
        self.trip.start_date = date.today()
        self.trip.save()
        with at_hour(8):
            call_command("send_trip_reminders")
            call_command("send_trip_reminders")
        notes = Notification.objects.filter(trip=self.trip, kind="trip_reminder", title__contains="starts today")
        self.assertEqual({n.user_id for n in notes}, {self.owner.id, self.friend.id})
        self.assertEqual(notes.count(), 2)  # once each, not twice

    def test_not_before_seven_in_the_morning(self):
        self.trip.start_date = date.today()
        self.trip.save()
        with at_hour(5):
            call_command("send_trip_reminders")
        self.assertFalse(Notification.objects.filter(title__contains="starts today").exists())

    def test_the_day_after_it_ends_organisers_are_asked_to_finish_it(self):
        self.trip.start_date = date.today() - timedelta(days=3)
        self.trip.end_date = date.today() - timedelta(days=1)
        self.trip.status = "active"
        self.trip.save()
        call_command("send_trip_reminders")
        notes = Notification.objects.filter(trip=self.trip, title__contains="mark it complete")
        self.assertEqual([n.user_id for n in notes], [self.owner.id])

    def test_the_day_after_it_ends_whoever_owes_is_told_who_to_pay(self):
        self.trip.start_date = date.today() - timedelta(days=3)
        self.trip.end_date = date.today() - timedelta(days=1)
        self.trip.status = "completed"
        self.trip.save()
        Expense.objects.create(trip=self.trip, title="Hotel", amount=2000, paid_by=self.owner)
        call_command("send_trip_reminders")
        call_command("send_trip_reminders")
        note = Notification.objects.get(trip=self.trip, kind="settle_reminder")
        self.assertEqual(note.user_id, self.friend.id)
        self.assertIn("You owe Owner ₹1,000", note.body)
