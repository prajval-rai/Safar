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
