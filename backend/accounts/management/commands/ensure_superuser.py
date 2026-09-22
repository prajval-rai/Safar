import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    """Creates a default superuser from environment variables, if one doesn't
    already exist. Meant to run on every deploy (see backend/start.sh) so a
    fresh environment always has an admin login, without anyone needing to
    open a shell or a DB tunnel by hand.

    Reads the same env var names Django's own `createsuperuser --noinput`
    uses, so it's a drop-in with that convention:
      DJANGO_SUPERUSER_USERNAME
      DJANGO_SUPERUSER_EMAIL      (optional)
      DJANGO_SUPERUSER_PASSWORD

    Safe to run repeatedly: if that username already exists, it does nothing
    — this never resets or overwrites a password someone has since changed.
    If the env vars aren't set at all (e.g. plain local dev), it silently
    skips rather than erroring, so it's harmless to call unconditionally.
    """

    help = "Creates a default superuser from DJANGO_SUPERUSER_* env vars, if one doesn't already exist."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "")

        if not username or not password:
            self.stdout.write("DJANGO_SUPERUSER_USERNAME/PASSWORD not set — skipping.")
            return

        if User.objects.filter(username=username).exists():
            self.stdout.write(f"Superuser '{username}' already exists — skipping.")
            return

        User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(self.style.SUCCESS(f"Created superuser '{username}'."))
