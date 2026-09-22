from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.shortcuts import get_object_or_404

from .models import Notification
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
