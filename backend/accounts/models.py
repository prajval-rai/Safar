from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractUser
from django.db import models

# XP needed to move from level L to L + 1. Level 8 -> 9 costs 3000 XP.
LEVEL_STEP = 375

# Fixed catalog a traveller picks one from when setting up account recovery —
# not free text, so there's always a consistent label to show back to them.
SECURITY_QUESTIONS = [
    ("pet_name", "What was the name of your first pet?"),
    ("birth_city", "In which city were you born?"),
    ("school_name", "What was the name of your first school?"),
    ("mother_maiden", "What is your mother's maiden name?"),
    ("favourite_food", "What is your favourite food?"),
    ("childhood_friend", "Who was your best friend growing up?"),
]


def _normalise_answer(raw: str) -> str:
    """Answers match regardless of case or stray spaces — "Simba", "simba "
    and "SIMBA" are all the same answer to a person, just not to ==."""
    return raw.strip().lower()

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
    # Account recovery without email: pick one fixed question, answer it once.
    # The answer is hashed with the same machinery as the password itself —
    # never stored, or shown back to anyone, in the clear.
    security_question = models.CharField(max_length=20, choices=SECURITY_QUESTIONS, blank=True)
    security_answer_hash = models.CharField(max_length=128, blank=True)
    # Google's stable per-account id ("sub" claim) for anyone who has ever
    # signed in with Google — never reused for a different Google account,
    # unlike email, which someone could theoretically change on Google's end.
    google_sub = models.CharField(max_length=64, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-xp"]

    def __str__(self) -> str:
        return self.display_name or self.username

    @property
    def name(self) -> str:
        return self.display_name or self.get_full_name() or self.username

    @property
    def security_question_label(self) -> str:
        return dict(SECURITY_QUESTIONS).get(self.security_question, "")

    def set_security_answer(self, raw_answer: str) -> None:
        self.security_answer_hash = make_password(_normalise_answer(raw_answer))

    def check_security_answer(self, raw_answer: str) -> bool:
        if not self.security_answer_hash:
            return False
        return check_password(_normalise_answer(raw_answer), self.security_answer_hash)

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
