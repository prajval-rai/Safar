from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import SECURITY_QUESTIONS

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
    # Whether a recovery question is set, and its label — never the answer,
    # and never even which question code it is, so a client can't fingerprint it.
    has_security_question = serializers.SerializerMethodField()
    security_question_label = serializers.CharField(read_only=True)

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
            "has_security_question",
            "security_question_label",
        ]
        read_only_fields = ["id", "username", "xp", "date_joined"]

    def get_has_security_question(self, obj) -> bool:
        return bool(obj.security_question)


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
    # Optional at signup — someone can add this later from Settings — but
    # setting both together here saves a trip back for anyone who wants
    # password recovery from day one.
    security_question = serializers.ChoiceField(
        choices=SECURITY_QUESTIONS, required=False, allow_blank=True
    )
    security_answer = serializers.CharField(
        write_only=True, required=False, allow_blank=True, min_length=2, max_length=100
    )

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "password",
            "display_name",
            "home_city",
            "avatar_emoji",
            "security_question",
            "security_answer",
        ]

    def validate(self, attrs):
        question = attrs.get("security_question")
        answer = attrs.get("security_answer")
        if bool(question) != bool(answer):
            raise serializers.ValidationError(
                {"security_answer": "Pick a question and give an answer, or leave both blank."}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        question = validated_data.pop("security_question", "")
        answer = validated_data.pop("security_answer", "")
        user = User(**validated_data)
        user.set_password(password)
        if question and answer:
            user.security_question = question
            user.set_security_answer(answer)
        user.save()
        return user


class SecurityQuestionSerializer(serializers.Serializer):
    """Sets or changes the signed-in user's recovery question. A separate,
    write-only endpoint rather than part of UserSerializer, since the answer
    needs hashing rather than a plain save."""

    question = serializers.ChoiceField(choices=SECURITY_QUESTIONS, source="security_question")
    answer = serializers.CharField(write_only=True, min_length=2, max_length=100)

    def save(self, **kwargs):
        user = self.context["user"]
        user.security_question = self.validated_data["security_question"]
        user.set_security_answer(self.validated_data["answer"])
        user.save(update_fields=["security_question", "security_answer_hash"])
        return user


class ResetPasswordSerializer(serializers.Serializer):
    """Step 2 of the forgot-password flow: the answer and a new password.
    Username-not-found and wrong-answer report the exact same error, so this
    can't be used to check which usernames exist."""

    username = serializers.CharField()
    answer = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    default_error_messages = {"no_match": "That answer doesn't match our records."}

    def validate(self, attrs):
        user = User.objects.filter(username__iexact=attrs["username"].strip()).first()
        if not user or not user.check_security_answer(attrs["answer"]):
            raise serializers.ValidationError(
                {"answer": self.error_messages["no_match"]}, code="no_match"
            )
        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user
