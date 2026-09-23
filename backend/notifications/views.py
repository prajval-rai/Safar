from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from django.conf import settings
from django.shortcuts import get_object_or_404

from .models import ExpoPushToken, Notification, PushSubscription
from .push import push_enabled
from .serializers import NotificationSerializer


class NotificationPagination(PageNumberPagination):
    page_size = 30


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_list(request):
    qs = Notification.objects.filter(user=request.user).select_related("actor", "trip", "track")
    paginator = NotificationPagination()
    page = paginator.paginate_queryset(qs, request)
    data = NotificationSerializer(page, many=True).data
    response = paginator.get_paginated_response(data)
    response.data["unread_count"] = Notification.objects.filter(user=request.user, read=False).count()
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count(request):
    return Response({"unread_count": Notification.objects.filter(user=request.user, read=False).count()})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read(request, pk):
    notification = get_object_or_404(Notification, pk=pk, user=request.user)
    if not notification.read:
        notification.read = True
        notification.save(update_fields=["read"])
    return Response(NotificationSerializer(notification).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    Notification.objects.filter(user=request.user, read=False).update(read=True)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([AllowAny])
def push_config(request):
    """Whether push is even switched on for this deploy, and the public key
    a browser needs to subscribe — never the private one. Lets the frontend
    quietly hide the "enable notifications" option rather than offering
    something that'll just fail if VAPID keys aren't set."""
    return Response({"enabled": push_enabled(), "public_key": settings.VAPID_PUBLIC_KEY})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_subscribe(request):
    """Saves (or refreshes) this browser's Web Push subscription — the
    frontend sends exactly what `PushSubscription.toJSON()` gives it."""
    data = request.data
    endpoint = data.get("endpoint")
    keys = data.get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        return Response({"detail": "Incomplete subscription."}, status=status.HTTP_400_BAD_REQUEST)

    PushSubscription.objects.update_or_create(
        user=request.user,
        endpoint=endpoint,
        defaults={
            "p256dh": keys["p256dh"],
            "auth": keys["auth"],
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:300],
        },
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_unsubscribe(request):
    """Called when someone turns push off on a device (or the browser tells
    us the subscription's gone) — removes just that one endpoint."""
    endpoint = request.data.get("endpoint")
    if endpoint:
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def expo_push_register(request):
    """Saves (or reassigns) this device's Expo push token — the mobile app's
    equivalent of push_subscribe. A token is globally unique on Expo's side,
    so `update_or_create` on the token alone correctly hands it to whoever's
    signed in on that device right now, even if that's a different account
    than last time."""
    token = request.data.get("token")
    if not token:
        return Response({"detail": "Missing token."}, status=status.HTTP_400_BAD_REQUEST)

    ExpoPushToken.objects.update_or_create(
        token=token,
        defaults={"user": request.user, "device_name": (request.data.get("device_name") or "")[:120]},
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def expo_push_unregister(request):
    """Called when someone turns push off on a device, or signs out of it."""
    token = request.data.get("token")
    if token:
        ExpoPushToken.objects.filter(user=request.user, token=token).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
