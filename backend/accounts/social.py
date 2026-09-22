"""Following, public profiles and the travel map.

Privacy rule used throughout: you always see your own trips; on anyone else's
profile you only see trips they've marked public.
"""

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Follow
from .serializers import PublicUserSerializer, UserMiniSerializer

User = get_user_model()

DEFAULT_AREA_KM = 10.0


def _target(username):
    return get_object_or_404(User, username__iexact=username)


def visible_trips(viewer, target):
    from trips.models import Trip

    trips = Trip.objects.filter(members__user=target)
    if viewer.pk != target.pk:
        trips = trips.filter(is_public=True)
    return trips.distinct()


def follow_counts(user):
    return {
        "followers": Follow.objects.filter(following=user).count(),
        "following": Follow.objects.filter(follower=user).count(),
    }


def _people(request, users):
    """User rows with whether *I* follow each one, for the followers/following lists."""
    users = list(users[:200])
    mine = set(
        Follow.objects.filter(follower=request.user, following__in=users).values_list(
            "following_id", flat=True
        )
    )
    return [
        {
            **UserMiniSerializer(user).data,
            "is_following": user.pk in mine,
            "is_me": user.pk == request.user.pk,
        }
        for user in users
    ]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_profile(request, username):
    from explore.models import Track
    from trips.models import Activity

    target = _target(username)
    trips = visible_trips(request.user, target)
    verified = Activity.objects.filter(
        completed_by=target,
        verified_by_location=True,
        latitude__isnull=False,
        day__trip__in=trips,
    )

    tracks = Track.objects.filter(author=target, is_published=True)
    unlocked = [
        {
            "code": row.achievement.code,
            "title": row.achievement.title,
            "icon": row.achievement.icon,
            "description": row.achievement.description,
            "unlocked_at": row.unlocked_at,
        }
        for row in target.achievements.select_related("achievement")
    ]

    return Response(
        {
            "user": PublicUserSerializer(target).data,
            **{f"{k}_count": v for k, v in follow_counts(target).items()},
            "is_me": target.pk == request.user.pk,
            "is_following": Follow.objects.filter(follower=request.user, following=target).exists(),
            "stats": {
                "trips_completed": trips.filter(status="completed").count(),
                "places_verified": verified.count(),
                "tracks": tracks.count(),
            },
            "achievements": unlocked,
        }
    )


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def follow_user(request, username):
    from rewards.services import evaluate_achievements

    target = _target(username)
    if target.pk == request.user.pk:
        raise ValidationError({"detail": "You can't follow yourself."})

    if request.method == "POST":
        _, created = Follow.objects.get_or_create(follower=request.user, following=target)
        if created:
            # "Local Hero" and friends unlock on follower counts.
            evaluate_achievements(target)
            from notifications.services import notify

            notify(
                target,
                "new_follower",
                f"{request.user.display_name or request.user.username} followed you",
                actor=request.user,
                body="Check out their trips and tracks.",
            )
    else:
        Follow.objects.filter(follower=request.user, following=target).delete()

    return Response(
        {
            "is_following": Follow.objects.filter(follower=request.user, following=target).exists(),
            "followers_count": Follow.objects.filter(following=target).count(),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_followers(request, username):
    target = _target(username)
    return Response(_people(request, User.objects.filter(follows_out__following=target)))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_following(request, username):
    target = _target(username)
    return Response(_people(request, User.objects.filter(follows_in__follower=target)))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_travel_map(request, username):
    """Everything the profile map plots: areas covered by finished trips, plus
    each stop the traveller really stood at (verified within 1 km)."""
    from trips.models import Activity

    target = _target(username)
    is_me = target.pk == request.user.pk
    trips = visible_trips(request.user, target)

    finished = trips.filter(status="completed")
    areas = [
        {
            "trip_id": str(trip.id),
            "title": trip.title,
            "destination": trip.destination,
            "region": trip.region,
            "latitude": trip.latitude,
            "longitude": trip.longitude,
            "radius_km": trip.area_radius_km or DEFAULT_AREA_KM,
            "cover_key": trip.cover_key,
            "end_date": trip.end_date,
        }
        for trip in finished.filter(latitude__isnull=False, longitude__isnull=False)
    ]

    places = [
        {
            "id": str(a.id),
            "title": a.title,
            "place_name": a.place_name,
            "category": a.category,
            "latitude": a.latitude,
            "longitude": a.longitude,
            "trip_title": a.day.trip.title,
            "completed_at": a.completed_at,
        }
        for a in Activity.objects.filter(
            completed_by=target,
            verified_by_location=True,
            latitude__isnull=False,
            longitude__isnull=False,
            day__trip__in=trips,
        ).select_related("day__trip")[:300]
    ]

    # Finished trips that predate Google coordinates. Only shown to their own
    # organisers, who can look the destination up once and save it.
    needs_coords = []
    if is_me:
        needs_coords = [
            {"trip_id": str(t.id), "destination": t.destination, "region": t.region}
            for t in finished.filter(
                latitude__isnull=True,
                members__user=target,
                members__role__in=["owner", "admin"],
            )
        ]

    # Every finished trip the viewer may see, with or without coordinates, so the
    # India map can colour a state from its name when there is no pin yet.
    finished_list = [
        {
            "trip_id": str(t.id),
            "title": t.title,
            "destination": t.destination,
            "region": t.region,
            "end_date": t.end_date,
        }
        for t in finished
    ]

    return Response(
        {
            "areas": areas,
            "places": places,
            "finished": finished_list,
            "needs_coords": needs_coords,
            "areas_covered": len({a["destination"].lower() for a in areas}),
        }
    )
