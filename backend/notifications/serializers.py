from rest_framework import serializers

from accounts.serializers import UserMiniSerializer

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserMiniSerializer(read_only=True)
    trip_id = serializers.UUIDField(source="trip.id", read_only=True, default=None)
    trip_title = serializers.CharField(source="trip.title", read_only=True, default="")
    track_id = serializers.UUIDField(source="track.id", read_only=True, default=None)
    track_title = serializers.CharField(source="track.title", read_only=True, default="")

    class Meta:
        model = Notification
        fields = [
            "id",
            "kind",
            "title",
            "body",
            "actor",
            "trip_id",
            "trip_title",
            "track_id",
            "track_title",
            "read",
            "created_at",
        ]
