from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.serializers import UserSerializer
from rewards.services import TRACK_PUBLISH_XP, award_xp, evaluate_achievements
from trips.models import Activity, Day, Trip, TripMember
from trips.serializers import TripDetailSerializer

from .models import PostLike, Track, TrackDay, TrackLike, TrackSave, TrackStop, TravelPost
from .serializers import TrackDetailSerializer, TrackListSerializer, TravelPostSerializer


class TrackViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filterset_fields = ["region", "trip_type", "difficulty", "days"]
    search_fields = ["title", "destination", "region", "summary"]

    def get_queryset(self):
        qs = Track.objects.filter(is_published=True).select_related("author")
        mine = self.request.query_params.get("mine")
        saved = self.request.query_params.get("saved")
        if mine:
            qs = Track.objects.filter(author=self.request.user).select_related("author")
        if saved:
            qs = qs.filter(saves__user=self.request.user)
        if self.request.query_params.get("following"):
            qs = qs.filter(author__follows_in__follower=self.request.user)
        sort = self.request.query_params.get("sort")
        if sort == "popular":
            qs = qs.annotate(n=Count("likes")).order_by("-n", "-created_at")
        return qs.distinct()

    def get_serializer_class(self):
        return TrackDetailSerializer if self.action == "retrieve" else TrackListSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.author != self.request.user:
            raise PermissionDenied("You can only edit tracks you created.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.author != self.request.user:
            raise PermissionDenied("You can only delete tracks you created.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def like(self, request, pk=None):
        track = self.get_object()
        like = TrackLike.objects.filter(track=track, user=request.user).first()
        if like:
            like.delete()
            liked = False
        else:
            TrackLike.objects.create(track=track, user=request.user)
            liked = True
        return Response({"liked": liked, "likes_count": track.likes.count()})

    @action(detail=True, methods=["post"], url_path="save")
    def save_track(self, request, pk=None):
        track = self.get_object()
        saved = TrackSave.objects.filter(track=track, user=request.user).first()
        if saved:
            saved.delete()
            is_saved = False
        else:
            TrackSave.objects.create(track=track, user=request.user)
            is_saved = True
        return Response({"saved": is_saved, "saves_count": track.saves.count()})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def use(self, request, pk=None):
        """Copy a track into a brand new trip of my own."""
        track = self.get_object()
        raw_date = request.data.get("start_date")
        if not raw_date:
            raise ValidationError({"start_date": "Pick the date you're starting."})
        try:
            start = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except ValueError:
            raise ValidationError({"start_date": "Use the format YYYY-MM-DD."})

        trip = Trip.objects.create(
            title=request.data.get("title") or track.title,
            destination=track.destination,
            region=track.region,
            summary=track.summary,
            cover_key=track.cover_key,
            cover_image=track.cover_image,
            start_date=start,
            end_date=start + timedelta(days=max(track.days, 1) - 1),
            trip_type=request.data.get("trip_type") or track.trip_type,
            budget_per_person=track.estimated_cost,
            created_by=request.user,
        )
        TripMember.objects.create(trip=trip, user=request.user, role="owner")

        track_days = list(track.track_days.prefetch_related("stops"))
        for offset in range(trip.duration_days):
            day = Day.objects.create(
                trip=trip, index=offset + 1, date=start + timedelta(days=offset)
            )
            if offset < len(track_days):
                source = track_days[offset]
                day.title = source.title
                day.save(update_fields=["title"])
                for stop in source.stops.all():
                    Activity.objects.create(
                        day=day,
                        title=stop.title,
                        category=stop.category,
                        place_name=stop.place_name,
                        latitude=stop.latitude,
                        longitude=stop.longitude,
                        start_time=stop.start_time,
                        description=stop.description,
                        cost=stop.cost,
                        xp_value=stop.xp_value,
                        order=stop.order,
                    )

        return Response(
            TripDetailSerializer(trip, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def track_from_trip(request):
    """'Turn your journey into a track others can follow.'"""
    trip_id = request.data.get("trip")
    trip = Trip.objects.filter(pk=trip_id, members__user=request.user).first()
    if not trip:
        raise ValidationError({"trip": "We couldn't find that trip in your list."})

    route = []
    for day in trip.days.prefetch_related("activities"):
        first = day.activities.exclude(place_name="").first()
        if first and first.place_name not in route:
            route.append(first.place_name)

    track = Track.objects.create(
        title=request.data.get("title") or trip.title,
        summary=request.data.get("summary") or trip.summary,
        destination=trip.destination,
        region=trip.region,
        cover_key=trip.cover_key,
        cover_image=trip.cover_image,
        days=trip.duration_days,
        trip_type=trip.trip_type,
        difficulty=request.data.get("difficulty", "easy"),
        best_season=request.data.get("best_season", ""),
        estimated_cost=request.data.get("estimated_cost") or trip.budget_per_person,
        route=route[:6],
        tags=request.data.get("tags", []),
        author=request.user,
        source_trip=trip,
    )

    for day in trip.days.prefetch_related("activities"):
        track_day = TrackDay.objects.create(track=track, index=day.index, title=day.title)
        for activity in day.activities.all():
            TrackStop.objects.create(
                track_day=track_day,
                title=activity.title,
                category=activity.category,
                place_name=activity.place_name,
                latitude=activity.latitude,
                longitude=activity.longitude,
                start_time=activity.start_time,
                description=activity.description,
                cost=activity.cost,
                xp_value=activity.xp_value,
                order=activity.order,
            )

    award_xp(request.user, TRACK_PUBLISH_XP, f"Published '{track.title}'", kind="track", trip=trip)
    unlocked = evaluate_achievements(request.user, trip=trip)
    request.user.refresh_from_db()
    return Response(
        {
            "track": TrackDetailSerializer(track, context={"request": request}).data,
            "xp_awarded": TRACK_PUBLISH_XP,
            "user": UserSerializer(request.user).data,
            "unlocked": [{"title": a.title, "icon": a.icon} for a in unlocked],
        },
        status=status.HTTP_201_CREATED,
    )


class TravelPostViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TravelPostSerializer
    search_fields = ["caption", "place"]

    def get_queryset(self):
        qs = TravelPost.objects.select_related("author", "trip")
        if self.request.query_params.get("mine"):
            qs = qs.filter(author=self.request.user)
        # "Following": only people I follow (plus nothing of my own).
        if self.request.query_params.get("following"):
            qs = qs.filter(author__follows_in__follower=self.request.user)
        author = self.request.query_params.get("author")
        if author:
            qs = qs.filter(author__username__iexact=author)
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def perform_destroy(self, instance):
        if instance.author != self.request.user:
            raise PermissionDenied("You can only delete your own posts.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def like(self, request, pk=None):
        post = self.get_object()
        like = PostLike.objects.filter(post=post, user=request.user).first()
        if like:
            like.delete()
            liked = False
        else:
            PostLike.objects.create(post=post, user=request.user)
            liked = True
        return Response({"liked": liked, "likes_count": post.likes.count()})
