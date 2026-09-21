from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.serializers import UserMiniSerializer

from .models import (
    Activity,
    ChatMessage,
    ChecklistItem,
    Day,
    Expense,
    Memory,
    Trip,
    TripMember,
)

User = get_user_model()


def _check_range(value, low, high, label):
    if value is not None and not (low <= value <= high):
        raise serializers.ValidationError(f"{label} must be between {low} and {high}.")
    return value


class ActivitySerializer(serializers.ModelSerializer):
    completed_by = UserMiniSerializer(read_only=True)
    assigned_to = UserMiniSerializer(read_only=True)
    day_index = serializers.IntegerField(source="day.index", read_only=True)
    trip = serializers.UUIDField(source="day.trip_id", read_only=True)
    memory_count = serializers.IntegerField(source="memories.count", read_only=True)

    class Meta:
        model = Activity
        fields = [
            "id",
            "day",
            "day_index",
            "trip",
            "title",
            "category",
            "place_name",
            "latitude",
            "longitude",
            "google_place_id",
            "place_address",
            "place_rating",
            "start_time",
            "end_time",
            "description",
            "notes",
            "cost",
            "xp_value",
            "requires_photo",
            "requires_checkin",
            "booking_url",
            "order",
            "status",
            "completed_at",
            "completed_by",
            "checked_in_at",
            "assigned_to",
            "verified_by_location",
            "memory_count",
        ]
        read_only_fields = [
            "status",
            "completed_at",
            "completed_by",
            "checked_in_at",
            "assigned_to",
            "verified_by_location",
        ]

    def validate_latitude(self, value):
        return _check_range(value, -90, 90, "Latitude")

    def validate_longitude(self, value):
        return _check_range(value, -180, 180, "Longitude")


class DaySerializer(serializers.ModelSerializer):
    activities = ActivitySerializer(many=True, read_only=True)
    progress_percent = serializers.IntegerField(read_only=True)
    is_complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = Day
        fields = [
            "id",
            "trip",
            "index",
            "date",
            "title",
            "notes",
            "progress_percent",
            "is_complete",
            "activities",
        ]
        read_only_fields = ["trip", "index"]


class TripMemberSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    xp_earned = serializers.IntegerField(read_only=True)
    progress_percent = serializers.IntegerField(read_only=True)

    class Meta:
        model = TripMember
        fields = ["id", "user", "role", "joined_at", "xp_earned", "progress_percent"]


class TripListSerializer(serializers.ModelSerializer):
    created_by = UserMiniSerializer(read_only=True)
    duration_days = serializers.IntegerField(read_only=True)
    progress_percent = serializers.IntegerField(read_only=True)
    total_xp = serializers.IntegerField(read_only=True)
    member_count = serializers.IntegerField(source="members.count", read_only=True)
    activity_count = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id",
            "title",
            "destination",
            "region",
            "summary",
            "cover_key",
            "cover_image",
            "address",
            "latitude",
            "longitude",
            "google_place_id",
            "area_radius_km",
            "interests",
            "start_date",
            "end_date",
            "trip_type",
            "pace",
            "transport",
            "budget_per_person",
            "status",
            "is_public",
            "created_by",
            "duration_days",
            "progress_percent",
            "total_xp",
            "member_count",
            "activity_count",
        ]

    def get_activity_count(self, obj) -> int:
        return Activity.objects.filter(day__trip=obj).count()


class TripDetailSerializer(TripListSerializer):
    days = DaySerializer(many=True, read_only=True)
    members = TripMemberSerializer(many=True, read_only=True)
    planned_xp = serializers.IntegerField(read_only=True)
    my_role = serializers.SerializerMethodField()

    class Meta(TripListSerializer.Meta):
        fields = TripListSerializer.Meta.fields + [
            "join_code",
            "days",
            "members",
            "planned_xp",
            "my_role",
            "created_at",
        ]

    def get_my_role(self, obj) -> str | None:
        user = self.context["request"].user
        member = next((m for m in obj.members.all() if m.user_id == user.id), None)
        return member.role if member else None


class TripCreateSerializer(serializers.ModelSerializer):
    """Backs the create-trip wizard. Days are generated from the date range."""

    invite_usernames = serializers.ListField(
        child=serializers.CharField(), required=False, write_only=True
    )

    class Meta:
        model = Trip
        fields = [
            "id",
            "title",
            "destination",
            "region",
            "summary",
            "cover_key",
            "cover_image",
            "address",
            "latitude",
            "longitude",
            "google_place_id",
            "area_radius_km",
            "interests",
            "start_date",
            "end_date",
            "trip_type",
            "pace",
            "transport",
            "budget_per_person",
            "is_public",
            "invite_usernames",
        ]
        read_only_fields = ["id"]

    def validate_latitude(self, value):
        return _check_range(value, -90, 90, "Latitude")

    def validate_longitude(self, value):
        return _check_range(value, -180, 180, "Longitude")

    def validate_area_radius_km(self, value):
        if value < 0 or value > 500:
            raise serializers.ValidationError("The trip area must be between 0 and 500 km.")
        return value

    def validate_interests(self, value):
        if not isinstance(value, list) or len(value) > 12 or not all(
            isinstance(item, str) and len(item) <= 30 for item in value
        ):
            raise serializers.ValidationError("Pick up to 12 interests.")
        return value

    def validate(self, attrs):
        start, end = attrs.get("start_date"), attrs.get("end_date")
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "The return date can't be before the start date."}
            )
        if start and end and (end - start).days > 60:
            raise serializers.ValidationError({"end_date": "Trips are limited to 60 days."})
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    paid_by = UserMiniSerializer(read_only=True)
    paid_by_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source="paid_by", write_only=True, required=False
    )

    class Meta:
        model = Expense
        fields = [
            "id",
            "trip",
            "title",
            "amount",
            "category",
            "paid_by",
            "paid_by_id",
            "split_type",
            "note",
            "spent_on",
            "created_at",
        ]
        read_only_fields = ["trip", "created_at"]


class ChecklistItemSerializer(serializers.ModelSerializer):
    assigned_to = UserMiniSerializer(read_only=True)
    assigned_to_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="assigned_to",
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ChecklistItem
        fields = [
            "id",
            "trip",
            "title",
            "category",
            "assigned_to",
            "assigned_to_id",
            "is_done",
            "created_at",
        ]
        read_only_fields = ["trip", "created_at"]


class MemorySerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Memory
        fields = [
            "id",
            "trip",
            "activity",
            "user",
            "image",
            "image_url",
            "caption",
            "created_at",
        ]
        read_only_fields = ["trip", "user", "created_at"]


class ChatMessageSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)

    class Meta:
        model = ChatMessage
        fields = ["id", "trip", "user", "text", "created_at"]
        read_only_fields = ["trip", "user", "created_at"]


class LiveTripSerializer(serializers.Serializer):
    """Everything the Live Trip screen needs in one request."""

    trip = TripListSerializer()
    day = DaySerializer(allow_null=True)
    now = ActivitySerializer(allow_null=True)
    next = ActivitySerializer(allow_null=True)
    completed_today = serializers.IntegerField()
    total_today = serializers.IntegerField()
    members = TripMemberSerializer(many=True)
    my_trip_xp = serializers.IntegerField()
