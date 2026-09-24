"""XP was rebalanced to be roughly a tenth of what it used to be (see
rewards.services). Bring everything already earned onto the same scale so old
and new numbers mean the same thing."""

from django.db import migrations
from django.db.models import Sum

# Mirrors rewards.services.CATEGORY_XP at the time of this migration.
CATEGORY_XP = {
    "adventure": 5,
    "sightseeing": 4,
    "nature": 4,
    "event": 3,
    "travel": 3,
    "shopping": 2,
    "food": 2,
    "stay": 1,
    "rest": 1,
}


def _tenth(amount: int) -> int:
    if amount == 0:
        return 0
    scaled = round(abs(amount) / 10) or 1
    return scaled if amount > 0 else -scaled


def rescale(apps, schema_editor):
    XPTransaction = apps.get_model("rewards", "XPTransaction")
    User = apps.get_model("accounts", "User")
    Activity = apps.get_model("trips", "Activity")
    TrackStop = apps.get_model("explore", "TrackStop")

    for txn in XPTransaction.objects.all().iterator():
        txn.amount = _tenth(txn.amount)
        txn.save(update_fields=["amount"])

    for user in User.objects.all().iterator():
        total = XPTransaction.objects.filter(user=user).aggregate(t=Sum("amount"))["t"] or 0
        user.xp = max(0, total)
        user.save(update_fields=["xp"])

    for model in (Activity, TrackStop):
        for category, xp in CATEGORY_XP.items():
            model.objects.filter(category=category).update(xp_value=xp)
        model.objects.exclude(category__in=CATEGORY_XP).update(xp_value=2)


class Migration(migrations.Migration):
    dependencies = [
        ("rewards", "0001_initial"),
        ("accounts", "0004_user_google_sub"),
        ("trips", "0006_activity_xp_and_experiences"),
        ("explore", "0002_trackstop_xp_default"),
    ]

    operations = [migrations.RunPython(rescale, migrations.RunPython.noop)]
