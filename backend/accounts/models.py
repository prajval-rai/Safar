from django.contrib.auth.models import AbstractUser
from django.db import models

# XP needed to move from level L to L + 1. Level 8 -> 9 costs 3000 XP.
LEVEL_STEP = 375

LEVEL_TITLES = [
    (1, "Naya Musafir"),  # new traveller
    (3, "Awara"),  # wanderer
    (5, "Yatri"),  # traveller / pilgrim
    (7, "Khoji"),  # explorer / seeker
    (10, "Rahi"),  # wayfarer, trailblazer
    (13, "Safar Samrat"),  # emperor of the journey
]

THEME_CHOICES = [
    ("saffron", "Saffron Sunrise"),
    ("peacock", "Peacock Teal"),
    ("backwater", "Kerala Backwater"),
    ("terracotta", "Rajasthan Terracotta"),
    ("himalaya", "Himalayan Dusk"),
]


def level_from_xp(xp: int) -> int:
    """Cumulative XP to reach level L is LEVEL_STEP * (L - 1) * L / 2."""
    level = 1
    while xp >= LEVEL_STEP * level * (level + 1) // 2:
        level += 1
    return level


def level_floor(level: int) -> int:
    return LEVEL_STEP * (level - 1) * level // 2


def level_title(level: int) -> str:
    title = LEVEL_TITLES[0][1]
    for threshold, name in LEVEL_TITLES:
        if level >= threshold:
            title = name
    return title


class User(AbstractUser):
    display_name = models.CharField(max_length=80, blank=True)
    home_city = models.CharField(max_length=80, blank=True)
    bio = models.CharField(max_length=240, blank=True)
    avatar_emoji = models.CharField(max_length=8, default="🧳")
    phone = models.CharField(max_length=20, blank=True)
    xp = models.PositiveIntegerField(default=0)
    theme = models.CharField(max_length=20, choices=THEME_CHOICES, default="saffron")
    color_mode = models.CharField(
        max_length=10,
        choices=[("light", "Light"), ("dark", "Dark"), ("system", "System")],
        default="system",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-xp"]

    def __str__(self) -> str:
        return self.display_name or self.username

    @property
    def name(self) -> str:
        return self.display_name or self.get_full_name() or self.username

    @property
    def level(self) -> int:
        return level_from_xp(self.xp)

    @property
    def level_name(self) -> str:
        return level_title(self.level)

    @property
    def xp_into_level(self) -> int:
        return self.xp - level_floor(self.level)

    @property
    def xp_for_next_level(self) -> int:
        return LEVEL_STEP * self.level

    @property
    def level_progress(self) -> int:
        target = self.xp_for_next_level
        return round(self.xp_into_level / target * 100) if target else 0


class Follow(models.Model):
    """`follower` follows `following`. One row per pair; you can't follow yourself."""

    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="follows_out")
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name="follows_in")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["follower", "following"], name="unique_follow"),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("following")), name="no_self_follow"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.follower} → {self.following}"
