"""Sends two kinds of reminder, both worked out from the itinerary itself —
no separately-configured reminder times to keep in sync:

  1. Day-before: everyone on a trip starting tomorrow gets one nudge.
  2. Hour-before: whoever's due at a stop (or everyone, if it's unassigned)
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

from notifications.services import notify_many
from trips.models import Activity, Trip


class Command(BaseCommand):
    help = "Sends day-before trip and hour-before itinerary reminder notifications. Safe to run repeatedly."

    def handle(self, *args, **options):
        day_before = self._send_day_before_trip_reminders()
        hour_before = self._send_hour_before_stop_reminders()
        self.stdout.write(
            self.style.SUCCESS(
                f"Sent {day_before} day-before and {hour_before} hour-before reminder notification(s)."
            )
        )

    def _send_day_before_trip_reminders(self) -> int:
        tomorrow = timezone.localdate() + timedelta(days=1)
        trips = Trip.objects.filter(
            start_date=tomorrow,
            status__in=["planning", "active"],
            day_before_reminder_sent=False,
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
                sent += len(members)
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
