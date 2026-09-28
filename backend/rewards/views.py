from django.db import IntegrityError, transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAdminUser, IsAuthenticated
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


# --- Reward catalog ------------------------------------------------------------
# Travellers browse and claim. Everything else — putting rewards up, editing
# them, and handling claims — is admin-only (is_staff), from the admin page.

MAX_IMAGE_BYTES = 5 * 1024 * 1024


class RewardOfferSerializer(serializers.ModelSerializer):
    claimed_count = serializers.SerializerMethodField()
    spots_left = serializers.SerializerMethodField()
    claimed_by_me = serializers.SerializerMethodField()
    # Where my claim stands — "pending", "delivered", "rejected" — or null.
    my_claim_status = serializers.SerializerMethodField()
    my_claim_note = serializers.SerializerMethodField()
    # Why the viewer can't claim it right now, or "" when they can.
    blocked_reason = serializers.SerializerMethodField()

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
            "my_claim_status",
            "my_claim_note",
            "blocked_reason",
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

    def validate_image(self, value):
        if value and value.size > MAX_IMAGE_BYTES:
            raise serializers.ValidationError("Pick a picture under 5 MB.")
        return value

    def _my_claim(self, obj):
        user = self.context["request"].user
        return next((c for c in obj.claims.all() if c.user_id == user.id), None)

    def get_claimed_count(self, obj) -> int:
        return sum(1 for c in obj.claims.all() if c.status != "rejected")

    def get_spots_left(self, obj) -> int:
        return max(0, obj.max_claims - self.get_claimed_count(obj))

    def get_claimed_by_me(self, obj) -> bool:
        return self._my_claim(obj) is not None

    def get_my_claim_status(self, obj):
        claim = self._my_claim(obj)
        return claim.status if claim else None

    def get_my_claim_note(self, obj) -> str:
        claim = self._my_claim(obj)
        return claim.admin_note if claim else ""

    def get_blocked_reason(self, obj) -> str:
        return claim_blocker(obj, self.context["request"].user)


def claim_blocker(offer, user) -> str:
    mine = offer.claims.filter(user=user).first()
    if mine:
        return "Your claim was declined." if mine.status == "rejected" else "You've already claimed this."
    if not offer.is_active:
        return "This reward isn't available right now."
    if offer.taken >= offer.max_claims:
        return "All claimed — every spot has gone."
    if user.xp < offer.xp_required:
        return f"You need {format_xp(offer.xp_required - user.xp)} more XP."
    return ""


class RewardOfferViewSet(viewsets.ModelViewSet):
    """The reward catalog. Everyone signed in can browse and claim; only
    admins can put rewards up (with a picture), change them or take them down."""

    serializer_class = RewardOfferSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        qs = RewardOffer.objects.prefetch_related("claims")
        # The admin page manages hidden rewards too; travellers only see live ones.
        if self.request.user.is_staff and self.request.query_params.get("all") == "1":
            return qs
        return qs.filter(is_active=True)

    def _require_admin(self):
        if not self.request.user.is_staff:
            raise PermissionDenied("Only admins can manage rewards.")

    def perform_create(self, serializer):
        self._require_admin()
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._require_admin()
        serializer.save()

    def perform_destroy(self, instance):
        self._require_admin()
        instance.delete()

    @action(detail=True, methods=["post"])
    def claim(self, request, pk=None):
        from django.contrib.auth import get_user_model

        from notifications.services import notify_many

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
        admins = get_user_model().objects.filter(is_staff=True, is_active=True).exclude(pk=request.user.pk)
        notify_many(
            list(admins),
            "reward_claimed",
            f"{request.user.name} claimed {offer.title}",
            actor=request.user,
            body="Open the admin page to hand it over.",
        )
        offer = RewardOffer.objects.prefetch_related("claims").get(pk=offer.pk)
        return Response(self.get_serializer(offer).data, status=status.HTTP_201_CREATED)


# --- Admin page ----------------------------------------------------------------


class AdminClaimSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    handled_by = UserMiniSerializer(read_only=True)
    reward = serializers.SerializerMethodField()

    class Meta:
        model = RewardClaim
        fields = ["id", "reward", "user", "status", "admin_note", "handled_by", "handled_at", "created_at"]
        read_only_fields = ["handled_at", "created_at"]

    def get_reward(self, obj) -> dict:
        request = self.context.get("request")
        image = obj.reward.image
        return {
            "id": obj.reward_id,
            "title": obj.reward.title,
            "xp_required": obj.reward.xp_required,
            "image": request.build_absolute_uri(image.url) if image and request else None,
        }


class RewardAdminSerializer(RewardOfferSerializer):
    """The catalog row as the admin page sees it: every claim, by status."""

    pending_count = serializers.SerializerMethodField()
    delivered_count = serializers.SerializerMethodField()
    rejected_count = serializers.SerializerMethodField()

    class Meta(RewardOfferSerializer.Meta):
        fields = RewardOfferSerializer.Meta.fields + ["pending_count", "delivered_count", "rejected_count"]

    def _count(self, obj, status_value):
        return sum(1 for c in obj.claims.all() if c.status == status_value)

    def get_pending_count(self, obj) -> int:
        return self._count(obj, "pending")

    def get_delivered_count(self, obj) -> int:
        return self._count(obj, "delivered")

    def get_rejected_count(self, obj) -> int:
        return self._count(obj, "rejected")


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_overview(request):
    """Everything the admin page opens on: totals, every reward (hidden ones
    too) with its claim counts."""
    rewards = RewardOffer.objects.prefetch_related("claims")
    claims = RewardClaim.objects.all()
    return Response(
        {
            "stats": {
                "rewards": rewards.count(),
                "active_rewards": rewards.filter(is_active=True).count(),
                "claims": claims.count(),
                "pending": claims.filter(status="pending").count(),
                "delivered": claims.filter(status="delivered").count(),
                "rejected": claims.filter(status="rejected").count(),
            },
            "rewards": RewardAdminSerializer(rewards, many=True, context={"request": request}).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_claims(request):
    """Every claim, newest first. Filter with ?status=, ?reward=<id>, ?q=<name>."""
    from django.db.models import Q

    claims = RewardClaim.objects.select_related("reward", "user", "handled_by")
    status_filter = request.query_params.get("status")
    if status_filter in {"pending", "delivered", "rejected"}:
        claims = claims.filter(status=status_filter)
    reward_id = request.query_params.get("reward")
    if reward_id and reward_id.isdigit():
        claims = claims.filter(reward_id=reward_id)
    query = (request.query_params.get("q") or "").strip()
    if query:
        claims = claims.filter(
            Q(user__username__icontains=query)
            | Q(user__display_name__icontains=query)
            | Q(user__email__icontains=query)
            | Q(reward__title__icontains=query)
        )
    return Response(AdminClaimSerializer(claims[:200], many=True, context={"request": request}).data)


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def admin_update_claim(request, pk):
    """Hand a reward over, turn a claim down, or put it back to pending — with
    an optional note the traveller sees (how to collect it, or why not)."""
    from django.utils import timezone

    from notifications.services import notify

    claim = RewardClaim.objects.select_related("reward", "user").filter(pk=pk).first()
    if not claim:
        return Response({"detail": "That claim doesn't exist."}, status=status.HTTP_404_NOT_FOUND)
    new_status = request.data.get("status", claim.status)
    if new_status not in {"pending", "delivered", "rejected"}:
        raise ValidationError({"status": "Pick pending, delivered or rejected."})
    note = str(request.data.get("admin_note", claim.admin_note))[:300]
    changed = new_status != claim.status
    if changed and new_status != "rejected" and claim.status == "rejected":
        # Un-rejecting takes a spot back — only if one is still free.
        if claim.reward.taken >= claim.reward.max_claims:
            raise ValidationError({"detail": "Every spot on this reward is taken now."})
    claim.status = new_status
    claim.admin_note = note
    if changed:
        claim.handled_by = request.user if new_status != "pending" else None
        claim.handled_at = timezone.now() if new_status != "pending" else None
    claim.save()
    if changed and new_status in {"delivered", "rejected"}:
        notify(
            claim.user,
            "reward_update",
            f"{claim.reward.title}: "
            + ("it's yours! 🎁" if new_status == "delivered" else "your claim was declined"),
            actor=request.user,
            body=note,
        )
    return Response(AdminClaimSerializer(claim, context={"request": request}).data)
