import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """One thing worth telling a traveller about — always created from a real
    event (someone joined your trip, your track got used, an achievement
    unlocked), never faked just to populate the bell icon."""

    KIND_CHOICES = [
        ("trip_member_added", "Added to a trip"),
        ("trip_joined", "Someone joined your trip"),
        ("trip_started", "Trip started"),
        ("trip_reminder", "Trip reminder"),
        ("activity_reminder", "Itinerary reminder"),
        ("track_used", "Someone used your track"),
        ("new_follower", "New follower"),
        ("achievement_unlocked", "Achievement unlocked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    # Who/what caused it — null for a system notification with no single actor.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    kind = models.CharField(max_length=32, choices=KIND_CHOICES)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=300, blank=True)

    # Where tapping the notification should go. At most one of these is set.
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    track = models.ForeignKey("explore.Track", on_delete=models.CASCADE, null=True, blank=True, related_name="+")

    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read", "-created_at"])]

    def __str__(self):
        return f"{self.kind} → {self.user}"
