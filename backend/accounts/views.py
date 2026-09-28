from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .google_auth import get_or_create_google_user, verify_google_token
from .serializers import UserSerializer
from .social import _people

User = get_user_model()


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


@api_view(["POST"])
@permission_classes([AllowAny])
def google_login(request):
    """The only way in, for both signup and login: verify the ID token Google's
    own "Sign in with Google" button handed the frontend, then find or create
    the matching Safar account and issue our own tokens."""
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


def _confirmed(request) -> bool:
    """Both account deletions need the username typed back, so neither can
    happen from a stray tap."""
    typed = (request.data.get("confirm") or "").strip()
    return typed.lower() == request.user.username.lower()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def deactivate_account(request):
    """Temporary delete: hide the account until its owner signs in again.
    Their trips, photos and XP are kept; they just disappear from search,
    profiles, the feed and the leaderboard."""
    if not _confirmed(request):
        return Response({"detail": "Type your username to confirm."}, status=status.HTTP_400_BAD_REQUEST)
    from django.utils import timezone

    user = request.user
    user.is_active = False
    user.deactivated_at = timezone.now()
    user.save(update_fields=["is_active", "deactivated_at"])
    return Response({"status": "deactivated"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delete_account(request):
    """Permanent delete: the account and everything that's only theirs (posts,
    tracks, photos, XP, follows) is gone for good. Group trips they organised
    aren't deleted with them — the next organiser takes over."""
    if not _confirmed(request):
        return Response({"detail": "Type your username to confirm."}, status=status.HTTP_400_BAD_REQUEST)
    from django.db import transaction

    from trips.models import Trip

    user = request.user
    with transaction.atomic():
        for trip in Trip.objects.filter(created_by=user):
            others = trip.members.exclude(user=user).select_related("user")
            # A co-planner first, otherwise whoever joined earliest.
            heir = others.filter(role="admin").order_by("joined_at").first() or others.order_by("joined_at").first()
            if heir is None:
                continue  # Nobody else on it — it goes with the account.
            heir.role = "owner"
            heir.save(update_fields=["role"])
            trip.created_by = heir.user
            trip.save(update_fields=["created_by"])
        user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search_users(request):
    """Find people to invite or follow, by name, username or email.

    Every word has to match somewhere, so "prajval rai" finds Prajval Rai
    however the name is stored. Email only matches from the start ("prajval",
    "prajval@gmail.com") — never "gmail" — and is never sent back."""
    query = (request.query_params.get("q") or "").strip()
    if len(query) < 2:
        return Response([])
    users = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
    if "@" in query:
        users = users.filter(email__istartswith=query)
    else:
        for word in query.split():
            users = users.filter(
                Q(username__icontains=word)
                | Q(display_name__icontains=word)
                | Q(first_name__icontains=word)
                | Q(last_name__icontains=word)
                | Q(email__istartswith=word)
            )
    users = users.order_by("display_name", "username")[:12]
    # Includes whether I already follow each person, so results can show Follow/Following.
    return Response(_people(request, users))
