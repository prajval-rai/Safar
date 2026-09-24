from rest_framework import serializers

from accounts.serializers import UserMiniSerializer

from .models import PostLike, Track, TrackDay, TrackLike, TrackSave, TrackStop, TravelPost


class TrackStopSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrackStop
        fields = [
            "id",
            "title",
            "category",
            "place_name",
            "latitude",
            "longitude",
            "start_time",
            "description",
            "cost",
            "xp_value",
            "order",
        ]


class TrackDaySerializer(serializers.ModelSerializer):
    stops = TrackStopSerializer(many=True, read_only=True)

    class Meta:
        model = TrackDay
        fields = ["id", "index", "title", "stops"]


class TrackListSerializer(serializers.ModelSerializer):
    author = UserMiniSerializer(read_only=True)
    likes_count = serializers.IntegerField(source="likes.count", read_only=True)
    saves_count = serializers.IntegerField(source="saves.count", read_only=True)
    stop_count = serializers.IntegerField(read_only=True)
    liked = serializers.SerializerMethodField()
    saved = serializers.SerializerMethodField()

    class Meta:
        model = Track
        fields = [
            "id",
            "title",
            "summary",
            "destination",
            "region",
            "cover_key",
            "cover_image",
            "days",
            "trip_type",
            "difficulty",
            "best_season",
            "estimated_cost",
            "route",
            "tags",
            "author",
            "likes_count",
            "saves_count",
            "stop_count",
            "liked",
            "saved",
            "created_at",
        ]

    def _user(self):
        request = self.context.get("request")
        return request.user if request else None

    def get_liked(self, obj) -> bool:
        user = self._user()
        return bool(user and user.is_authenticated and obj.likes.filter(user=user).exists())

    def get_saved(self, obj) -> bool:
        user = self._user()
        return bool(user and user.is_authenticated and obj.saves.filter(user=user).exists())


class TrackDetailSerializer(TrackListSerializer):
    track_days = TrackDaySerializer(many=True, read_only=True)
    total_xp = serializers.IntegerField(read_only=True)

    class Meta(TrackListSerializer.Meta):
        fields = TrackListSerializer.Meta.fields + ["track_days", "total_xp"]


class TravelPostSerializer(serializers.ModelSerializer):
    author = UserMiniSerializer(read_only=True)
    likes_count = serializers.IntegerField(source="likes.count", read_only=True)
    liked = serializers.SerializerMethodField()
    trip_title = serializers.CharField(source="trip.title", read_only=True, default="")
    can_open_trip = serializers.SerializerMethodField()
    # The trip's destination palette, so a shared story card matches it.
    theme = serializers.SerializerMethodField()
    trip_is_public = serializers.BooleanField(source="trip.is_public", read_only=True, default=False)

    class Meta:
        model = TravelPost
        fields = [
            "id",
            "author",
            "trip",
            "trip_title",
            "can_open_trip",
            "trip_is_public",
            "theme",
            "track",
            "caption",
            "place",
            "cover_key",
            "image_url",
            "likes_count",
            "liked",
            "created_at",
        ]
        read_only_fields = ["author", "track", "created_at"]

    def validate_trip(self, trip):
        request = self.context.get("request")
        if trip and request and not trip.members.filter(user=request.user).exists():
            raise serializers.ValidationError("You can only post about your own trips.")
        return trip

    def validate_caption(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Write something first.")
        if len(value) > 1000:
            raise serializers.ValidationError("Keep it under 1,000 characters.")
        return value

    def get_can_open_trip(self, obj) -> bool:
        """Trip pages are for members only, so only they get a link."""
        request = self.context.get("request")
        user = request.user if request else None
        return bool(
            obj.trip_id
            and user
            and user.is_authenticated
            and obj.trip.members.filter(user=user).exists()
        )

    def get_theme(self, obj) -> str:
        from trips.regional_theme import DEFAULT_TRIP_THEME

        return obj.trip.theme if obj.trip_id else DEFAULT_TRIP_THEME

    def get_liked(self, obj) -> bool:
        request = self.context.get("request")
        user = request.user if request else None
        return bool(user and user.is_authenticated and obj.likes.filter(user=user).exists())
