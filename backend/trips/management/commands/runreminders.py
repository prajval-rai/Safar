"""A simple always-on loop around `send_trip_reminders`, for hosts without
their own scheduler. Checks every 5 minutes, forever.

    python manage.py runreminders

Meant to run as its *own* process — a separate Railway service pointed at
this command as its start command, for instance — rather than inside the web
process. Running it once per gunicorn worker would send every reminder that
many times over, since each worker would find the same due trips/activities.
If your host has a native cron/scheduled-job feature, prefer pointing that
directly at `send_trip_reminders` instead of running this forever-loop.
"""

import time
import traceback

from django.core.management import call_command
from django.core.management.base import BaseCommand

CHECK_EVERY_SECONDS = 300


class Command(BaseCommand):
    help = "Runs send_trip_reminders every 5 minutes, forever. Run as its own single process, not per web worker."

    def handle(self, *args, **options):
        self.stdout.write(
            f"Checking for due trip/itinerary reminders every {CHECK_EVERY_SECONDS} seconds. Ctrl+C to stop."
        )
        while True:
            try:
                call_command("send_trip_reminders")
            except Exception:
                # One bad cycle shouldn't kill the loop — log it and try again next time.
                self.stderr.write(self.style.ERROR("send_trip_reminders failed this cycle:"))
                traceback.print_exc()
            time.sleep(CHECK_EVERY_SECONDS)
