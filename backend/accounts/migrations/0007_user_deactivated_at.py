from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_decimal_xp"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="deactivated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
