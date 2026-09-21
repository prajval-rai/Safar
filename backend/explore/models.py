import uuid

from django.conf import settings
from django.db import models


class Track(models.Model):
    """A finished trip published as a route others can follow."""

    DIFFICULTY = [("easy", "Easy"), ("moderate", "Moderate"), ("tough", "Tough")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=120)
    summary = models.CharField(max_length=240, blank=True)
    destination = models.CharField(max_length=120)
    region = models.CharField(max_length=80, blank=True)
    cover_key = models.CharField(max_length=40, default="mountain")
    cover_image = models.URLField(blank=True)
    days = models.PositiveIntegerField(default=1)
    trip_type = models.CharField(max_length=20, default="friends")
    difficulty = models.CharField(max_length=12, choices=DIFFICULTY, default="easy")
    best_season = models.CharField(max_length=60, blank=True)
    estimated_cost = models.PositiveIntegerField(default=0)
    route = models.JSONField(default=list, blank=True)  # ["Mumbai", "Goa", "South Goa"]
    tags = models.JSONField(default=list, blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tracks"
    )
    source_trip = models.ForeignKey(
        "trips.Trip", null=True, blank=True, on_delete=models.SET_NULL, related_name="tracks"
    )
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    @property
    def stop_count(self) -> int:
        return TrackStop.objects.filter(track_day__track=self).count()

    @property
    def total_xp(self) -> int:
        return (
            TrackStop.objects.filter(track_day__track=self).aggregate(
                total=models.Sum("xp_value")
            )["total"]
            or 0
        )


class TrackDay(models.Model):
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="track_days")
    index = models.PositiveIntegerField()
    title = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["index"]
        unique_together = ("track", "index")

    def __str__(self) -> str:
        return f"Day {self.index} of {self.track.title}"


class TrackStop(models.Model):
    track_day = models.ForeignKey(TrackDay, on_delete=models.CASCADE, related_name="stops")
    title = models.CharField(max_length=120)
    category = models.CharField(max_length=20, default="sightseeing")
    place_name = models.CharField(max_length=160, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    description = models.TextField(blank=True)
    cost = models.PositiveIntegerField(default=0)
    xp_value = models.PositiveIntegerField(default=20)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "start_time"]

    def __str__(self) -> str:
        return self.title


class TrackLike(models.Model):
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="track_likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("track", "user")


class TrackSave(models.Model):
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="saves")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="track_saves"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("track", "user")


class TravelPost(models.Model):
    """A short story shared from a trip — the social half of Explore."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts"
    )
    trip = models.ForeignKey(
        "trips.Trip", null=True, blank=True, on_delete=models.SET_NULL, related_name="posts"
    )
    track = models.ForeignKey(
        Track, null=True, blank=True, on_delete=models.SET_NULL, related_name="posts"
    )
    caption = models.TextField()
    place = models.CharField(max_length=120, blank=True)
    cover_key = models.CharField(max_length=40, default="mountain")
    image_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.caption[:40]


class PostLike(models.Model):
    post = models.ForeignKey(TravelPost, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="post_likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("post", "user")
