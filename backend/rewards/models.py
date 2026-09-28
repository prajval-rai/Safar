from django.conf import settings
from django.db import models


class XPTransaction(models.Model):
    KINDS = [
        ("activity", "Activity completed"),
        ("distance", "Distance travelled"),
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
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    kind = models.CharField(max_length=20, choices=KINDS, default="activity")
    reason = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} {self.amount:+} ({self.reason})"


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


class HeldXP(models.Model):
    """Trip-completion XP kept back from a traveller who still owes money on
    that trip. It isn't in their total until they've settled up; then it's
    paid out as a normal XPTransaction and marked released."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="held_xp")
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="held_xp")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    kind = models.CharField(max_length=20, default="trip")
    reason = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        state = "released" if self.released_at else "held"
        return f"{self.user} {self.amount} XP {state} ({self.reason})"


class RewardOffer(models.Model):
    """A real-world reward staff put up for travellers to claim — a picture,
    how much XP you need to have earned, and how many people can claim it.
    Claiming doesn't spend XP; it's a threshold, like an achievement."""

    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="rewards/", null=True, blank=True)
    xp_required = models.DecimalField(max_digits=10, decimal_places=2)
    # How many people can claim it in total; once it's gone, it's gone.
    max_claims = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["xp_required", "-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.xp_required} XP)"

    @property
    def taken(self) -> int:
        """Spots used up — every claim except the ones an admin rejected."""
        return self.claims.exclude(status="rejected").count()


class RewardClaim(models.Model):
    """Someone claiming a reward. An admin then hands it over (delivered) or
    turns it down (rejected) from the admin page; a rejected claim frees its
    spot for someone else."""

    STATUSES = [("pending", "Waiting for admin"), ("delivered", "Delivered"), ("rejected", "Rejected")]

    reward = models.ForeignKey(RewardOffer, on_delete=models.CASCADE, related_name="claims")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reward_claims"
    )
    status = models.CharField(max_length=12, choices=STATUSES, default="pending")
    # Shown to the traveller — how to collect it, or why it was turned down.
    admin_note = models.CharField(max_length=300, blank=True)
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["reward", "user"], name="one_claim_per_person"),
        ]

    def __str__(self) -> str:
        return f"{self.user} claimed {self.reward}"
