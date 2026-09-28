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
    # Where the organiser was when they started the trip — the first leg of
    # distance XP runs from here to the first stop (see rewards.services.distance_xp).
    start_latitude = models.FloatField(null=True, blank=True)
    start_longitude = models.FloatField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    # Completion XP actually paid per member / to the organiser. A trip the
    # organiser finishes early pays a share of the full bonus, so undo has to
    # know exactly what to take back.
    completion_bonus = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    organizer_bonus = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    # True when the organiser ended the trip before every stop was done; the
    # stops left over were marked skipped.
    finished_early = models.BooleanField(default=False)
    # A trip to somewhere within MIN_TRIP_DISTANCE_KM of where it was planned or
    # started from. It can still be planned and run, but it never earns or costs
    # XP (see rewards.services.award_xp) — a trip round the corner isn't an XP farm.
    no_xp = models.BooleanField(default=False)
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
    def total_xp(self):
        return (
            Activity.objects.filter(day__trip=self, status="completed").aggregate(
                total=models.Sum("xp_value")
            )["total"]
            or 0
        )

    @property
    def start_point(self):
        if self.start_latitude is None or self.start_longitude is None:
            return None
        return (self.start_latitude, self.start_longitude)

    @property
    def planned_xp(self):
        """An estimate of the distance XP on offer: the whole route, from the
        start point (once there is one) through every pinned stop in itinerary
        order. What's actually paid depends on the order stops are really done."""
        from rewards.services import route_xp

        stops = Activity.objects.filter(
            day__trip=self, latitude__isnull=False, longitude__isnull=False
        ).exclude(status="skipped").order_by("day__index", "order", "start_time", "created_at")
        points = [(a.latitude, a.longitude) for a in stops]
        if self.start_point:
            points.insert(0, self.start_point)
        return route_xp(points)

    def first_gallery_photo(self):
        """The earliest photo anyone added to this trip's gallery, or None."""
        return (
            self.memories.filter(
                (models.Q(image__isnull=False) & ~models.Q(image="")) | ~models.Q(image_url="")
            )
            .order_by("created_at")
            .first()
        )

    def display_cover(self, request=None) -> str:
        """The trip's picture everywhere it's shown — trip cards, the trip page,
        the Feed, invites, tracks. Once the gallery has a photo, the first one
        is the trip's picture; before that it's the cover picked when planning
        (a Google place photo), or "" for the illustrated cover."""
        from .media import memory_photo_url

        first = self.first_gallery_photo()
        if first:
            return memory_photo_url(first, request)
        return self.cover_image

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
    # When this member last had the group chat open (it polls while open), so
    # nobody is pushed about messages already in front of them — and when they
    # were last pushed about chat, so a burst of messages is one alert, not ten.
    chat_seen_at = models.DateTimeField(null=True, blank=True)
    chat_pushed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("trip", "user")
        ordering = ["joined_at"]

    def __str__(self) -> str:
        return f"{self.user} in {self.trip}"

    @property
    def xp_earned(self):
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


class TripInvite(models.Model):
    """An organiser asked someone to come along. They're only on the trip once
    they accept; declining just closes the invite. Joining with the invite
    code skips this — typing a code is already saying yes."""

    STATUS = [("pending", "Pending"), ("accepted", "Accepted"), ("declined", "Declined")]

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="invites")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trip_invites"
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_trip_invites"
    )
    status = models.CharField(max_length=10, choices=STATUS, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("trip", "user")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} invited to {self.trip} ({self.status})"


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
    # Distance XP this stop paid everyone: the leg from the previous completed
    # stop (or the trip's start point) to here. Set on the server when the stop
    # is completed, never by the client; 0 while it's still planned.
    xp_value = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    leg_distance_km = models.FloatField(null=True, blank=True)
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


class Settlement(models.Model):
    """Money paid back between two travellers to settle a trip's expenses.

    The payer says "I've paid" (pending) and the receiver confirms it; only
    confirmed settlements move the balances. A receiver recording cash they
    got is confirmed straight away."""

    METHODS = [("upi", "UPI"), ("cash", "Cash")]
    STATUSES = [("pending", "Waiting for confirmation"), ("confirmed", "Confirmed")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="settlements")
    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="settlements_paid"
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="settlements_received"
    )
    amount = models.PositiveIntegerField()
    method = models.CharField(max_length=10, choices=METHODS, default="upi")
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.from_user} → {self.to_user} ₹{self.amount} ({self.status})"


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
    # Fingerprint of the photo (SHA-256 of the file, or of the link) so the
    # same picture only ever earns XP once, whoever uploads it again.
    content_hash = models.CharField(max_length=64, blank=True, db_index=True)
    # True for the first upload of this photo anywhere — the one that earned XP.
    is_original = models.BooleanField(default=True)
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
