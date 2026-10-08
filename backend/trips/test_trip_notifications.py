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


class OrganiserReminderTests(SafarTestCase):
    """The organiser picks when "the trip's coming up" goes out; checklist
    nudges follow for anyone with items left."""

    def setUp(self):
        super().setUp()
        self.trip.start_date = date.today() + timedelta(days=2)
        self.trip.end_date = date.today() + timedelta(days=3)
        self.trip.save()
        from trips.models import ChecklistItem

        ChecklistItem.objects.create(trip=self.trip, title="Sunscreen")  # shared
        ChecklistItem.objects.create(trip=self.trip, title="ID card", assigned_to=self.friend)
        ChecklistItem.objects.create(trip=self.trip, title="Power bank", assigned_to=self.owner, is_done=True)

    def set_reminder(self, user, at, note=""):
        return self.client_for(user).post(
            f"/api/trips/{self.trip.id}/reminder/", {"at": at, "note": note}, format="json"
        )

    def test_only_an_organiser_can_set_it_and_only_before_the_trip(self):
        soon = (timezone.now() + timedelta(hours=1)).isoformat()
        self.assertEqual(self.set_reminder(self.friend, soon).status_code, 403)
        self.assertEqual(self.set_reminder(self.owner, (timezone.now() - timedelta(hours=1)).isoformat()).status_code, 400)
        too_late = (timezone.now() + timedelta(days=5)).isoformat()
        self.assertEqual(self.set_reminder(self.owner, too_late).status_code, 400)
        response = self.set_reminder(self.owner, soon, "Meet at Dadar, 6 AM")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["pre_start_reminder_note"], "Meet at Dadar, 6 AM")

    def test_it_goes_out_on_time_with_the_note_then_a_checklist_nudge(self):
        self.set_reminder(self.owner, (timezone.now() + timedelta(minutes=5)).isoformat(), "Meet at Dadar, 6 AM")
        call_command("send_trip_reminders")
        self.assertFalse(Notification.objects.filter(kind="trip_reminder").exists())  # not yet

        from trips.models import Trip

        Trip.objects.filter(pk=self.trip.pk).update(pre_start_reminder_at=timezone.now() - timedelta(minutes=1))
        call_command("send_trip_reminders")
        call_command("send_trip_reminders")
        reminders = Notification.objects.filter(kind="trip_reminder", trip=self.trip)
        self.assertEqual(reminders.count(), 2)
        self.assertIn("in 2 days", reminders.first().title)
        self.assertEqual(reminders.first().body, "Meet at Dadar, 6 AM")
        # The friend has two items left (the shared one and their own); the
        # owner one (the shared item — theirs is ticked).
        friend = Notification.objects.get(kind="checklist_reminder", user=self.friend)
        self.assertIn("2 things left", friend.title)
        self.assertIn("Sunscreen", friend.body)
        owner = Notification.objects.get(kind="checklist_reminder", user=self.owner)
        self.assertIn("1 thing left", owner.title)

    def test_a_scheduled_reminder_replaces_the_default_day_before_one(self):
        self.trip.start_date = date.today() + timedelta(days=1)
        self.trip.save()
        self.set_reminder(self.owner, (timezone.now() + timedelta(hours=2)).isoformat())
        call_command("send_trip_reminders")
        self.assertFalse(Notification.objects.filter(kind="trip_reminder").exists())

    def test_home_lists_trips_coming_up_with_checklist_items_left(self):
        due = self.client_for(self.friend).get("/api/home/").data["checklist_due"]
        self.assertEqual(len(due), 1)
        self.assertEqual(due[0]["pending"], 2)
        self.assertIn("ID card", due[0]["items"])
