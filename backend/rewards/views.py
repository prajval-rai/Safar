from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.serializers import UserMiniSerializer, UserSerializer

from .models import XPTransaction
from .services import XP_RULES, achievement_progress


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
