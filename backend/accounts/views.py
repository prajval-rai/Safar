from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from .google_auth import get_or_create_google_user, verify_google_token
from .models import SECURITY_QUESTIONS
from .serializers import (
    RegisterSerializer,
    ResetPasswordSerializer,
    SecurityQuestionSerializer,
    UserSerializer,
)
from .social import _people

User = get_user_model()


class ResetAttemptThrottle(ScopedRateThrottle):
    """Both steps of the forgot-password flow are unauthenticated by design —
    this is what actually stops someone from machine-guessing usernames or
    security answers, since there's no login to rate-limit instead."""

    scope = "password_reset"


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(
        {"user": UserSerializer(user).data, **tokens_for(user)},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def google_login(request):
    """One button, both signup and login: verify the ID token Google's own
    "Sign in with Google" button handed the frontend, then find or create the
    matching Safar account and issue our own tokens exactly like /register/
    or /token/ would."""
    credential = request.data.get("credential")
    if not credential:
        return Response({"detail": "Missing Google credential."}, status=status.HTTP_400_BAD_REQUEST)

    claims = verify_google_token(credential)
    user, created = get_or_create_google_user(claims)
    return Response(
        {"user": UserSerializer(user).data, "created": created, **tokens_for(user)},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    if request.method == "PATCH":
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def security_questions(request):
    """The fixed catalog someone picks from — at signup, or later in Settings."""
    return Response([{"value": value, "label": label} for value, label in SECURITY_QUESTIONS])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_security_question(request):
    """Sets or replaces the signed-in user's recovery question — from
    Settings, whether or not one was chosen at signup."""
    serializer = SecurityQuestionSerializer(data=request.data, context={"user": request.user})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([ResetAttemptThrottle])
def reset_password_question(request):
    """Step 1 of forgot-password: given a username, hand back which question
    is set for it. Always the same shape whether the username doesn't exist
    or just has no question set, so this can't be used to check who's
    registered — only ever "does this get you anywhere", never "who's real"."""
    username = (request.data.get("username") or "").strip()
    user = User.objects.filter(username__iexact=username).first() if username else None
    if not user or not user.security_question:
        return Response({"available": False})
    return Response({"available": True, "question": user.security_question_label})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([ResetAttemptThrottle])
def reset_password_confirm(request):
    """Step 2: verify the answer and set the new password."""
    serializer = ResetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({"detail": "Password updated — you can log in now."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search_users(request):
    """Used by 'Who's coming with you?' in the create-trip wizard."""
    query = (request.query_params.get("q") or "").strip()
    if len(query) < 2:
        return Response([])
    users = User.objects.filter(
        Q(username__icontains=query) | Q(display_name__icontains=query)
    ).exclude(pk=request.user.pk)[:12]
    # Includes whether I already follow each person, so results can show Follow/Following.
    return Response(_people(request, users))
