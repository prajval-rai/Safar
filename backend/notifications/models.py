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
        ("trip_left", "Someone left your trip"),
        ("trip_started", "Trip started"),
        ("trip_reminder", "Trip reminder"),
        ("activity_reminder", "Itinerary reminder"),
        ("trip_cancelled", "Trip cancelled"),
        ("trip_completed", "Trip completed"),
        ("settle_paid", "Someone says they paid you back"),
        ("settle_confirmed", "Your payment was confirmed"),
        ("xp_released", "Held XP released after settling up"),
        ("track_used", "Someone used your track"),
        ("track_published", "Someone you follow published a track"),
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


class PushSubscription(models.Model):
    """One browser/device that's opted in to real (lock-screen-capable) push
    notifications — the Web Push standard's subscription object, saved as-is.
    A traveller can have several (phone, laptop, …); each gets its own row."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions"
    )
    endpoint = models.URLField(max_length=500)
    # The two keys the browser hands back alongside the endpoint — needed to
    # encrypt the payload the push service delivers.
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    # Just for anyone reading the admin list — "which of my devices is this".
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "endpoint")

    def __str__(self):
        return f"{self.user}'s device ({self.endpoint[:40]}…)"


class ExpoPushToken(models.Model):
    """One mobile device (the Safar Android/iOS app, not the website)
    registered for push via Expo's push service — separate from
    PushSubscription, which is Web Push and browser-only. `token` is
    globally unique on Expo's side already, not just unique per user: if the
    same device token turns up for a different user (someone logged out and
    someone else logged in on that phone), it's reassigned to them, since a
    device token really does belong to whoever's currently signed in there."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="expo_push_tokens"
    )
    token = models.CharField(max_length=200, unique=True)
    device_name = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user}'s device ({self.token[:24]}…)"
