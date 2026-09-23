from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
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
    xp_into_level = serializers.IntegerField(read_only=True)
    xp_for_next_level = serializers.IntegerField(read_only=True)
    level_progress = serializers.IntegerField(read_only=True)

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
            "xp",
            "level",
            "level_name",
            "xp_into_level",
            "xp_for_next_level",
            "level_progress",
            "theme",
            "color_mode",
            "date_joined",
        ]
        read_only_fields = ["id", "username", "xp", "date_joined"]


class PublicUserSerializer(serializers.ModelSerializer):
    """What anyone signed in can see about a traveller — never email or phone."""

    name = serializers.CharField(read_only=True)
    level = serializers.IntegerField(read_only=True)
    level_name = serializers.CharField(read_only=True)
    xp_into_level = serializers.IntegerField(read_only=True)
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


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ["username", "email", "password", "display_name", "home_city", "avatar_emoji"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
