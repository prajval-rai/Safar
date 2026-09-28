from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserMiniSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    level_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "name", "avatar_emoji", "xp", "level", "level_name"]


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    level = serializers.IntegerField(read_only=True)
    level_name = serializers.CharField(read_only=True)
    xp_into_level = serializers.FloatField(read_only=True)
    xp_for_next_level = serializers.IntegerField(read_only=True)
    level_progress = serializers.IntegerField(read_only=True)
    is_staff = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "name",
            "display_name",
            "home_city",
            "bio",
            "avatar_emoji",
            "phone",
            "upi_id",
            "xp",
            "level",
            "level_name",
            "xp_into_level",
            "xp_for_next_level",
            "level_progress",
            "theme",
            "color_mode",
            "date_joined",
            "is_staff",
        ]
        # Email is read-only: it comes from Google, and Google sign-in matches
        # accounts by it — letting people set it would let them claim someone
        # else's future sign-in.
        read_only_fields = ["id", "email", "xp", "date_joined", "is_staff"]

    def validate_username(self, value: str) -> str:
        """Usernames are in profile links (/u/<username>), so keep them short,
        URL-safe and unique regardless of case."""
        import re

        value = (value or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_.]{3,30}", value):
            raise serializers.ValidationError(
                "Use 3–30 letters, numbers, dots or underscores — no spaces."
            )
        taken = User.objects.filter(username__iexact=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError("That username is taken.")
        return value

    def validate_upi_id(self, value: str) -> str:
        from trips.settle import is_valid_upi_id, normalise_upi_id

        value = normalise_upi_id(value)
        if value and not is_valid_upi_id(value):
            raise serializers.ValidationError("That doesn't look like a UPI ID — it's usually like name@okaxis.")
        return value


class PublicUserSerializer(serializers.ModelSerializer):
    """What anyone signed in can see about a traveller — never email or phone."""

    name = serializers.CharField(read_only=True)
    level = serializers.IntegerField(read_only=True)
    level_name = serializers.CharField(read_only=True)
    xp_into_level = serializers.FloatField(read_only=True)
    xp_for_next_level = serializers.IntegerField(read_only=True)
    level_progress = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "bio",
            "home_city",
            "avatar_emoji",
            "xp",
            "level",
            "level_name",
            "xp_into_level",
            "xp_for_next_level",
            "level_progress",
            "date_joined",
        ]
