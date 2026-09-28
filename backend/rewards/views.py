from django.db import IntegrityError, transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.serializers import UserMiniSerializer, UserSerializer

from .models import RewardClaim, RewardOffer, XPTransaction
from .services import XP_RULES, achievement_progress, format_xp


class XPTransactionSerializer(serializers.ModelSerializer):
    trip_title = serializers.CharField(source="trip.title", read_only=True, default="")

    class Meta:
        model = XPTransaction
        fields = ["id", "amount", "kind", "reason", "trip", "trip_title", "created_at"]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_rewards(request):
    user = request.user
    achievements = achievement_progress(user)
    recent = user.xp_transactions.select_related("trip")[:20]
    return Response(
        {
            "user": UserSerializer(user).data,
            "achievements": achievements,
            "unlocked_count": sum(1 for a in achievements if a["unlocked"]),
            "total_count": len(achievements),
            "recent": XPTransactionSerializer(recent, many=True).data,
            "xp_rules": XP_RULES,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def leaderboard(request):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    top = User.objects.order_by("-xp")[:20]
    rows = [
        {"rank": i + 1, **UserMiniSerializer(u).data, "is_me": u.pk == request.user.pk}
        for i, u in enumerate(top)
    ]
    return Response(rows)


class RewardOfferSerializer(serializers.ModelSerializer):
    claimed_count = serializers.SerializerMethodField()
    spots_left = serializers.SerializerMethodField()
    claimed_by_me = serializers.SerializerMethodField()
    # Why the viewer can't claim it right now, or "" when they can.
    blocked_reason = serializers.SerializerMethodField()
    # Staff see who claimed it; everyone else gets an empty list.
    claimants = serializers.SerializerMethodField()

    class Meta:
        model = RewardOffer
        fields = [
            "id",
            "title",
            "description",
            "image",
            "xp_required",
            "max_claims",
            "is_active",
            "claimed_count",
            "spots_left",
            "claimed_by_me",
            "blocked_reason",
            "claimants",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate_xp_required(self, value):
        if value <= 0:
            raise serializers.ValidationError("Set how much XP someone needs — more than 0.")
        return value

    def validate_max_claims(self, value):
        if value < 1:
            raise serializers.ValidationError("At least one person has to be able to claim it.")
        return value

    def _user(self):
        return self.context["request"].user

    def get_claimed_count(self, obj) -> int:
        return obj.claims.count()

    def get_spots_left(self, obj) -> int:
        return max(0, obj.max_claims - obj.claims.count())

    def get_claimed_by_me(self, obj) -> bool:
        return obj.claims.filter(user=self._user()).exists()

    def get_blocked_reason(self, obj) -> str:
        return claim_blocker(obj, self._user())

    def get_claimants(self, obj) -> list:
        if not self._user().is_staff:
            return []
        return [
            {**UserMiniSerializer(c.user).data, "claimed_at": c.created_at}
            for c in obj.claims.select_related("user")
        ]


def claim_blocker(offer, user) -> str:
    if offer.claims.filter(user=user).exists():
        return "You've already claimed this."
    if not offer.is_active:
        return "This reward isn't available right now."
    if offer.claims.count() >= offer.max_claims:
        return "All claimed — every spot has gone."
    if user.xp < offer.xp_required:
        return f"You need {format_xp(offer.xp_required - user.xp)} more XP."
    return ""


class RewardOfferViewSet(viewsets.ModelViewSet):
    """The reward catalog. Everyone signed in can browse and claim; only staff
    can put rewards up (with a picture), change the rules, or take them down."""

    serializer_class = RewardOfferSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        qs = RewardOffer.objects.prefetch_related("claims")
        return qs if self.request.user.is_staff else qs.filter(is_active=True)

    def _require_staff(self):
        if not self.request.user.is_staff:
            raise PermissionDenied("Only Safar staff can manage rewards.")

    def perform_create(self, serializer):
        self._require_staff()
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._require_staff()
        serializer.save()

    def perform_destroy(self, instance):
        self._require_staff()
        instance.delete()

    @action(detail=True, methods=["post"])
    def claim(self, request, pk=None):
        with transaction.atomic():
            # Lock the reward so two people can't both take the last spot.
            offer = RewardOffer.objects.select_for_update().get(pk=self.get_object().pk)
            blocker = claim_blocker(offer, request.user)
            if blocker:
                raise ValidationError({"detail": blocker})
            try:
                with transaction.atomic():
                    RewardClaim.objects.create(reward=offer, user=request.user)
            except IntegrityError:
                raise ValidationError({"detail": "You've already claimed this."})
        return Response(
            self.get_serializer(offer).data,
            status=status.HTTP_201_CREATED,
        )
