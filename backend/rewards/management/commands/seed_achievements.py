from django.core.management.base import BaseCommand

from rewards.models import Achievement
from rewards.services import seed_achievements


class Command(BaseCommand):
    """Populates the achievement catalog (title, icon, goal, XP reward for each
    badge) from the fixed list in rewards.services.DEFAULT_ACHIEVEMENTS.

    Meant to run on every deploy (see backend/start.sh), same as
    ensure_superuser — a fresh database has no Achievement rows at all until
    this runs, so the Rewards screen's Achievements tab has nothing to show.

    Unlike `manage.py seed`, this never touches users, trips or any other
    data — just the achievement definitions themselves — so it's safe to run
    against a real, already-live database. It's also idempotent: existing
    achievements are matched by code and updated in place (`update_or_create`
    inside seed_achievements()), never duplicated.
    """

    help = "Populates/updates the achievement catalog. Safe to run repeatedly, including in production."

    def handle(self, *args, **options):
        before = Achievement.objects.count()
        seed_achievements()
        after = Achievement.objects.count()
        self.stdout.write(
            self.style.SUCCESS(f"Achievement catalog up to date ({after} total, {after - before} added).")
        )
