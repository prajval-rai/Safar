"""Sends the trip reminders, all worked out from the trip itself — no
separately-configured reminder times to keep in sync:

  1. Day-before: everyone on a trip starting tomorrow gets one nudge.
  2. Morning-of: from 7 a.m. on the first day, "starts today".
  3. Day-after: once a trip's last day is over — organisers of a trip still
     not marked complete are asked to finish it, and anyone who still owes
     money on it is told exactly who to pay.
  4. Hour-before: whoever's due at a stop (or everyone, if it's unassigned)
     gets nudged about an hour before its start time — every stop with a
     time on it, not just the first one. The very first dated stop in the
     whole trip is phrased as the trip itself starting, since that's what it
     feels like to the traveller even though it's really just an activity.

Meant to run every few minutes via a scheduler — see `runreminders` for a
simple always-on loop, or point any external scheduler (a Railway Cron
Job, cron(1), …) at `manage.py send_trip_reminders` directly. Idempotent:
each trip/activity is only ever reminded once per milestone
(day_before_reminder_sent / hour_before_reminder_sent), so running this
as often as you like is always safe.
"""

from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.services import notify, notify_many
from trips.models import Activity, Trip
from trips.reminders import nudge_checklist

# The "starts today" reminder waits until morning.
MORNING_HOUR = 7


class Command(BaseCommand):
    help = "Sends day-before trip and hour-before itinerary reminder notifications. Safe to run repeatedly."

    def handle(self, *args, **options):
        custom = self._send_organiser_reminders()
        day_before = self._send_day_before_trip_reminders()
        day_of = self._send_day_of_trip_reminders()
        after_end = self._send_after_end_reminders()
        hour_before = self._send_hour_before_stop_reminders()
        self.stdout.write(
            self.style.SUCCESS(
                f"Sent {custom} organiser, {day_before} day-before, {day_of} morning-of, {after_end} after-the-trip and "
                f"{hour_before} hour-before reminder notification(s)."
            )
        )

    def _send_organiser_reminders(self) -> int:
        """The reminder the organiser scheduled (instead of the day-before one),
        with their note, then a checklist nudge for anyone with items left."""
        trips = Trip.objects.filter(
            pre_start_reminder_at__lte=timezone.now(),
            pre_start_reminder_sent=False,
            status__in=["planning", "active"],
            is_past=False,
        )
        sent = 0
        for trip in trips:
            members = [m.user for m in trip.members.select_related("user")]
            days = (trip.start_date - timezone.localdate()).days
            when = "today" if days <= 0 else "tomorrow" if days == 1 else f"in {days} days"
            note = trip.pre_start_reminder_note
            notify_many(
                members,
                "trip_reminder",
                f"{trip.title} starts {when}!",
                body=note or f"Get ready for {trip.destination} — check the plan and your checklist.",
                trip=trip,
            )
            sent += len(members) + nudge_checklist(trip, members)
            trip.pre_start_reminder_sent = True
            trip.save(update_fields=["pre_start_reminder_sent"])
        return sent

    def _send_day_of_trip_reminders(self) -> int:
        if timezone.localtime().hour < MORNING_HOUR:
            return 0
        trips = Trip.objects.filter(
            start_date=timezone.localdate(),
            status__in=["planning", "active"],
            is_past=False,
            day_of_reminder_sent=False,
        )
        sent = 0
        for trip in trips:
            members = [m.user for m in trip.members.select_related("user")]
            notify_many(
                members,
                "trip_reminder",
                f"{trip.title} starts today! 🧳",
                body=f"Have a great time in {trip.destination}. Check in at each stop when you get there to earn its XP.",
                trip=trip,
            )
            sent += len(members) + nudge_checklist(trip, members, last_call=True)
            trip.day_of_reminder_sent = True
            trip.save(update_fields=["day_of_reminder_sent"])
        return sent

    def _send_after_end_reminders(self) -> int:
        from trips.settle import owes_money
        from trips.views import money_line_for, trip_expense_balances

        trips = Trip.objects.filter(
            end_date__lt=timezone.localdate(),
            status__in=["planning", "active", "completed"],
            is_past=False,
            after_end_reminder_sent=False,
        )
        sent = 0
        for trip in trips:
            members = [m for m in trip.members.select_related("user")]
            if trip.status != "completed":
                organisers = [m.user for m in members if m.role in ("owner", "admin")]
                notify_many(
                    organisers,
                    "trip_reminder",
                    f"{trip.title} has ended — mark it complete",
                    body="Finish the trip in Safar so everyone gets their completion XP and the final money split.",
                    trip=trip,
                )
                sent += len(organisers)
            balances = trip_expense_balances(trip)
            for member in members:
                if owes_money(balances, member.user):
                    notify(
                        member.user,
                        "settle_reminder",
                        f"Settle up for {trip.title}",
                        body=f"{money_line_for(trip, member.user, balances)} Pay back to unlock your completion XP.",
                        trip=trip,
                    )
                    sent += 1
            trip.after_end_reminder_sent = True
            trip.save(update_fields=["after_end_reminder_sent"])
        return sent

    def _send_day_before_trip_reminders(self) -> int:
        tomorrow = timezone.localdate() + timedelta(days=1)
        trips = Trip.objects.filter(
            start_date=tomorrow,
            status__in=["planning", "active"],
            day_before_reminder_sent=False,
            # An organiser who scheduled their own reminder gets that instead.
            pre_start_reminder_at__isnull=True,
        )
        sent = 0
        for trip in trips:
            members = [m.user for m in trip.members.select_related("user")]
            if members:
                notify_many(
                    members,
                    "trip_reminder",
                    f"{trip.title} starts tomorrow!",
                    body=f"Pack your bags — you're headed to {trip.destination} tomorrow.",
                    trip=trip,
                )
                sent += len(members) + nudge_checklist(trip, members)
            trip.day_before_reminder_sent = True
            trip.save(update_fields=["day_before_reminder_sent"])
        return sent

    def _send_hour_before_stop_reminders(self) -> int:
        now = timezone.localtime()
        window_end = now + timedelta(hours=1)
        today = timezone.localdate()
        # A stop today or tomorrow could still land in the next hour
        # (checked precisely below) — anything further out can't yet.
        candidates = (
            Activity.objects.filter(
                status="planned",
                start_time__isnull=False,
                hour_before_reminder_sent=False,
                day__date__range=(today, today + timedelta(days=1)),
            )
            .select_related("day", "day__trip", "assigned_to")
            .order_by("day__date", "start_time", "order")
        )

        sent = 0
        first_stop_id_by_trip: dict = {}
        for activity in candidates:
            starts_at = timezone.make_aware(datetime.combine(activity.day.date, activity.start_time))
            if not (now <= starts_at <= window_end):
                continue

            trip = activity.day.trip
            if trip.id not in first_stop_id_by_trip:
                first_stop = self._first_dated_activity(trip)
                first_stop_id_by_trip[trip.id] = first_stop.id if first_stop else None
            is_trip_start = first_stop_id_by_trip[trip.id] == activity.id

            recipients = (
                [activity.assigned_to]
                if activity.assigned_to
                else [m.user for m in trip.members.select_related("user")]
            )
            if recipients:
                when = activity.start_time.strftime("%I:%M %p").lstrip("0")
                if is_trip_start:
                    notify_many(
                        recipients,
                        "trip_reminder",
                        f"{trip.title} starts in about an hour!",
                        body=f"First stop: {activity.title} around {when}.",
                        trip=trip,
                    )
                else:
                    place = f" · {activity.place_name}" if activity.place_name else ""
                    notify_many(
                        recipients,
                        "activity_reminder",
                        f"{activity.title} starts soon",
                        body=f"Around {when}{place}",
                        trip=trip,
                    )
                sent += len(recipients)
            activity.hour_before_reminder_sent = True
            activity.save(update_fields=["hour_before_reminder_sent"])
        return sent

    @staticmethod
    def _first_dated_activity(trip):
        return (
            Activity.objects.filter(day__trip=trip, start_time__isnull=False)
            .order_by("day__date", "start_time", "order")
            .first()
        )
