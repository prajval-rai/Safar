from django.conf import settings
from django.db import models


class XPTransaction(models.Model):
    KINDS = [
        ("activity", "Activity completed"),
        ("day", "Day completed"),
        ("trip", "Trip completed"),
        ("photo", "Memory added"),
        ("checkin", "Checked in"),
        ("track", "Track published"),
        ("bonus", "Bonus"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="xp_transactions"
    )
    trip = models.ForeignKey(
        "trips.Trip",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="xp_transactions",
    )
    amount = models.IntegerField()
    kind = models.CharField(max_length=20, choices=KINDS, default="activity")
    reason = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} +{self.amount} ({self.reason})"


class Achievement(models.Model):
    code = models.SlugField(unique=True)
    title = models.CharField(max_length=80)
    description = models.CharField(max_length=200)
    icon = models.CharField(max_length=8, default="🏆")
    xp_reward = models.PositiveIntegerField(default=100)
    # goal_kind is matched in rewards.services.evaluate_achievements
    goal_kind = models.CharField(max_length=30, default="trips_completed")
    goal_value = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["goal_kind", "goal_value"]

    def __str__(self) -> str:
        return self.title


class UserAchievement(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="achievements"
    )
    achievement = models.ForeignKey(
        Achievement, on_delete=models.CASCADE, related_name="unlocked_by"
    )
    trip = models.ForeignKey(
        "trips.Trip", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "achievement")
        ordering = ["-unlocked_at"]

    def __str__(self) -> str:
        return f"{self.user} unlocked {self.achievement}"
