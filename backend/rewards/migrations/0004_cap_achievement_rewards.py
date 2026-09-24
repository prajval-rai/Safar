"""Every reward is now between 1 and 10 XP, badges included."""

from django.db import migrations


def update_rewards(apps, schema_editor):
    from rewards.services import DEFAULT_ACHIEVEMENTS

    Achievement = apps.get_model("rewards", "Achievement")
    for code, _title, _description, _icon, xp, _kind, _value in DEFAULT_ACHIEVEMENTS:
        Achievement.objects.filter(code=code).update(xp_reward=xp)


class Migration(migrations.Migration):
    dependencies = [("rewards", "0003_rescale_achievement_rewards")]

    operations = [migrations.RunPython(update_rewards, migrations.RunPython.noop)]
