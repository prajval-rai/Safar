"""Achievement rewards are only re-seeded on deploy, so a badge unlocked between
the XP rescale and the next seed would still pay its old reward. Update them
here, in the same migrate run as the rescale."""

from django.db import migrations


def update_rewards(apps, schema_editor):
    from rewards.services import DEFAULT_ACHIEVEMENTS

    Achievement = apps.get_model("rewards", "Achievement")
    for code, title, description, icon, xp, kind, value in DEFAULT_ACHIEVEMENTS:
        Achievement.objects.filter(code=code).update(
            title=title, description=description, xp_reward=xp, goal_kind=kind, goal_value=value
        )


class Migration(migrations.Migration):
    dependencies = [("rewards", "0002_rescale_xp")]

    operations = [migrations.RunPython(update_rewards, migrations.RunPython.noop)]
