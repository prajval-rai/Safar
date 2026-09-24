import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .regional_theme import theme_for_trip

TRIP_TYPES = [
    ("weekend", "Weekend Getaway"),
    ("road", "Road Trip"),
    ("family", "Family Trip"),
    ("friends", "Friends Trip"),
    ("couple", "Couple Trip"),
    ("solo", "Solo Trip"),
    ("college", "College Group"),
    ("office", "Office Trip"),
    ("pilgrimage", "Pilgrimage"),
    ("adventure", "Adventure / Trek"),
]

PACE_CHOICES = [
    ("relaxed", "Relaxed"),
    ("balanced", "Balanced"),
    ("packed", "Packed"),
]

TRANSPORT_CHOICES = [
    ("car", "Car"),
    ("bike", "Bike"),
    ("train", "Train"),
    ("flight", "Flight"),
    ("bus", "Bus"),
    ("mixed", "Mixed"),
]

TRIP_STATUS = [
    ("planning", "Planning"),
    ("active", "Live"),
    ("completed", "Completed"),
    ("cancelled", "Cancelled"),
]

ACTIVITY_CATEGORIES = [
    ("sightseeing", "Sightseeing"),
    ("food", "Food"),
    ("travel", "Travel"),
    ("stay", "Stay"),
    ("adventure", "Adventure"),
    ("shopping", "Shopping"),
    ("rest", "Rest"),
    ("event", "Event"),
    ("nature", "Nature"),
]

ACTIVITY_STATUS = [
    ("planned", "Planned"),
    ("completed", "Completed"),
    ("skipped", "Skipped"),
]


def make_join_code() -> str:
    return secrets.token_hex(3).upper()


class Trip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=120)
    destination = models.CharField(max_length=120)
    region = models.CharField(max_length=80, blank=True)
    summary = models.CharField(max_length=240, blank=True)
    cover_key = models.CharField(max_length=40, default="mountain")
    cover_image = models.URLField(blank=True)
    address = models.CharField(max_length=300, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    google_place_id = models.CharField(max_length=200, blank=True)
    # Approximate size of the main trip area, drawn as a soft circle on the map.
    # It is deliberately not an administrative boundary.
    area_radius_km = models.FloatField(default=0)
    # Interest ids picked in the wizard, e.g. ["temples", "food"].
    interests = models.JSONField(default=list, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    trip_type = models.CharField(max_length=20, choices=TRIP_TYPES, default="friends")
    pace = models.CharField(max_length=20, choices=PACE_CHOICES, default="balanced")
    transport = models.CharField(max_length=20, choices=TRANSPORT_CHOICES, default="mixed")
    budget_per_person = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=TRIP_STATUS, default="planning")
    is_public = models.BooleanField(default=False)
    join_code = models.CharField(max_length=12, unique=True, default=make_join_code)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_trips"
    )
    # Set once the "starts tomorrow" reminder has gone out, so it's never
    # sent twice (see trips.management.commands.send_trip_reminders).
    day_before_reminder_sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self) -> str:
        return self.title

    @property
    def duration_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    @property
    def theme(self) -> str:
        """The site theme this trip's destination calls for — computed live
        from `destination`/`region`, not stored, so it can never drift out of
        sync with them. Every member sees the same value; joining via the
        invite code is just becoming a member, so this comes along
        automatically."""
        return theme_for_trip(self.destination, self.region)

    @property
    def activity_counts(self) -> tuple[int, int]:
        activities = Activity.objects.filter(day__trip=self)
        return activities.filter(status="completed").count(), activities.count()

    @property
    def progress_percent(self) -> int:
        done, total = self.activity_counts
        return round(done / total * 100) if total else 0

    @property
    def total_xp(self) -> int:
        return (
            Activity.objects.filter(day__trip=self, status="completed").aggregate(
                total=models.Sum("xp_value")
            )["total"]
            or 0
        )

    @property
    def planned_xp(self) -> int:
        return (
            Activity.objects.filter(day__trip=self).aggregate(total=models.Sum("xp_value"))[
                "total"
            ]
            or 0
        )

    def current_day(self):
        """The day the traveller is on right now, or the first unfinished day."""
        today = timezone.localdate()
        day = self.days.filter(date=today).first()
        if day:
            return day
        return self.days.filter(activities__status="planned").distinct().first() or self.days.first()


class TripMember(models.Model):
    ROLES = [("owner", "Owner"), ("admin", "Co-planner"), ("member", "Traveller")]

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trip_memberships"
    )
    role = models.CharField(max_length=10, choices=ROLES, default="member")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("trip", "user")
        ordering = ["joined_at"]

    def __str__(self) -> str:
        return f"{self.user} in {self.trip}"

    @property
    def xp_earned(self) -> int:
        """Everything this person earned on this trip — stops, day and trip
        bonuses, memories, check-ins — straight from their XP ledger."""
        return (
            self.user.xp_transactions.filter(trip=self.trip).aggregate(
                total=models.Sum("amount")
            )["total"]
            or 0
        )

    @property
    def progress_percent(self) -> int:
        # A stop the organiser completes is done for the whole group.
        return self.trip.progress_percent


class Day(models.Model):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="days")
    index = models.PositiveIntegerField()
    date = models.DateField()
    title = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["index"]
        unique_together = ("trip", "index")

    def __str__(self) -> str:
        return f"Day {self.index} · {self.trip.title}"

    @property
    def progress_percent(self) -> int:
        total = self.activities.count()
        if not total:
            return 0
        return round(self.activities.filter(status="completed").count() / total * 100)

    @property
    def is_complete(self) -> bool:
        return self.activities.exists() and not self.activities.filter(status="planned").exists()


class Activity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    day = models.ForeignKey(Day, on_delete=models.CASCADE, related_name="activities")
    title = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=ACTIVITY_CATEGORIES, default="sightseeing")
    place_name = models.CharField(max_length=160, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    google_place_id = models.CharField(max_length=200, blank=True)
    place_address = models.CharField(max_length=300, blank=True)
    place_rating = models.FloatField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    cost = models.PositiveIntegerField(default=0)
    # Set from the category on save (see rewards.services.stop_xp), never by the client.
    xp_value = models.PositiveIntegerField(default=2)
    booking_url = models.URLField(blank=True)
    order = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=12, choices=ACTIVITY_STATUS, default="planned")
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="completed_activities",
    )
    checked_in_at = models.DateTimeField(null=True, blank=True)
    # Who is responsible for this stop. Set by the organiser or a co-planner; once
    # assigned, only that person (or an organiser) can complete it.
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_activities",
    )
    # True when the completer's phone was within 1 km of the place. Organiser
    # overrides and stops with no pinned location leave this False.
    verified_by_location = models.BooleanField(default=False)
    completed_distance_m = models.FloatField(null=True, blank=True)
    # Set once the "starts in about an hour" reminder has gone out, so a
    # reminder is never sent twice (see trips.management.commands.send_trip_reminders).
    hour_before_reminder_sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "start_time", "created_at"]
        verbose_name_plural = "activities"

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        from rewards.services import stop_xp

        # A finished stop keeps the value it paid out, so undo takes back exactly that.
        if self.status != "completed":
            self.xp_value = stop_xp(self.category)
            fields = kwargs.get("update_fields")
            if fields is not None and "xp_value" not in fields:
                kwargs["update_fields"] = [*fields, "xp_value"]
        super().save(*args, **kwargs)

    @property
    def trip_id_value(self):
        return self.day.trip_id


class Expense(models.Model):
    SPLIT_CHOICES = [("equal", "Split equally"), ("payer", "Paid by one person")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="expenses")
    title = models.CharField(max_length=120)
    amount = models.PositiveIntegerField()
    category = models.CharField(max_length=20, choices=ACTIVITY_CATEGORIES, default="food")
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="expenses_paid"
    )
    split_type = models.CharField(max_length=10, choices=SPLIT_CHOICES, default="equal")
    note = models.CharField(max_length=200, blank=True)
    spent_on = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-spent_on", "-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ₹{self.amount}"


class ChecklistItem(models.Model):
    CATEGORY_CHOICES = [
        ("packing", "Packing"),
        ("documents", "Documents"),
        ("booking", "Bookings"),
        ("shopping", "Shopping"),
        ("other", "Other"),
    ]

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="checklist")
    title = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="packing")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="checklist_items",
    )
    is_done = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["is_done", "created_at"]

    def __str__(self) -> str:
        return self.title


class Memory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="memories")
    activity = models.ForeignKey(
        Activity, null=True, blank=True, on_delete=models.SET_NULL, related_name="memories"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memories"
    )
    image = models.ImageField(upload_to="memories/", null=True, blank=True)
    image_url = models.URLField(blank=True)
    caption = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.caption or f"Memory from {self.trip.title}"


class ChatMessage(models.Model):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="messages")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trip_messages"
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.user}: {self.text[:30]}"


class TripExperience(models.Model):
    """What a traveller wrote about a trip once it was over — one per person per
    trip. A row with `skipped` set means they said "not now" to the prompt, so
    Home stops asking about that trip."""

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="experiences")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trip_experiences"
    )
    text = models.TextField(max_length=4000, blank=True)
    skipped = models.BooleanField(default=False)
    # The write-up is also shared to the Feed as a travel post; editing it
    # updates that same post.
    post = models.OneToOneField(
        "explore.TravelPost",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="experience",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("trip", "user")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} on {self.trip}"
