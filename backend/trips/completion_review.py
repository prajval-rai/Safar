"""Ask an admin to complete a trip the app couldn't.

No signal at the stops means no check-ins and no "Mark complete" — the trip
happened, but the app never saw it. The organiser can send it to an admin
instead, with photos from the trip as the proof (PastTripConfig.min_photos of
them, the same bar as a past trip). An admin looks through the photos — with
what their camera data says about when and where they were taken — and:

- approves: every stop is marked done, everyone who added a photo to the trip
  counts as having been at its stops, and the trip is completed the normal way
  (completion bonuses by share, achievements, the money split) — or
- rejects, with a note saying what's missing; the organiser can send it again.

The admin queue reuses the past-trip review screen: AdminCompletionSerializer
speaks the same shape as AdminPastTripSerializer.
"""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from accounts.serializers import UserMiniSerializer

from .models import Activity, Memory, PastTripConfig, StopCheckIn, Trip
from .past import AdminPastTripSerializer, photo_count


def completion_info(trip, user) -> dict | None:
    """The trip page's "ask an admin" block, or None when it doesn't apply
    (a past trip, one that's over, or one that hasn't started yet)."""
    if trip.is_past or trip.status not in ("planning", "active", "completed"):
        return None
    if trip.status == "completed" and trip.completion_review_status != "approved":
        return None
    if trip.start_date > timezone.localdate():
        return None
    config = PastTripConfig.current()
    return {
        "status": trip.completion_review_status,
        "note": trip.completion_review_note,
        "requested_at": trip.completion_requested_at,
        "reviewed_at": trip.completion_reviewed_at,
        "photos": photo_count(trip),
        "photos_needed": config.min_photos,
    }


def _admins(exclude=None):
    admins = get_user_model().objects.filter(is_staff=True, is_active=True)
    if exclude is not None:
        admins = admins.exclude(pk=exclude.pk)
    return list(admins)


def request_completion(trip, user, note=""):
    from notifications.services import notify_many

    member = trip.members.filter(user=user).first()
    if not member or member.role not in ("owner", "admin"):
        raise PermissionDenied("Only the trip's organiser can ask for this.")
    if trip.is_past:
        raise ValidationError({"detail": "Past trips are reviewed from their own page."})
    if trip.status not in ("planning", "active"):
        raise ValidationError({"detail": f"This trip is already {trip.status}."})
    if trip.start_date > timezone.localdate():
        raise ValidationError({"detail": "The trip hasn't started yet."})
    if trip.completion_review_status == "pending":
        raise ValidationError({"detail": "It's already waiting for an admin."})
    needed = PastTripConfig.current().min_photos
    have = photo_count(trip)
    if have < needed:
        raise ValidationError(
            {"detail": f"Add at least {needed} photos from the trip first — it has {have} so far."}
        )

    trip.completion_review_status = "pending"
    trip.completion_request_note = (note or "").strip()[:300]
    trip.completion_requested_at = timezone.now()
    trip.completion_review_note = ""
    trip.save(
        update_fields=[
            "completion_review_status",
            "completion_request_note",
            "completion_requested_at",
            "completion_review_note",
            "updated_at",
        ]
    )
    notify_many(
        _admins(exclude=user),
        "completion_submitted",
        f"{user.name} asked to complete {trip.title}",
        actor=user,
        body=f"{trip.destination} · {have} photos. They couldn't mark it done in the app — review it.",
        trip=trip,
        url="/manage?tab=completions",
    )


@transaction.atomic
def approve_completion(trip, admin, note=""):
    from notifications.services import notify_many
    from rewards.services import evaluate_achievements

    from .attendance import near_start
    from .views import complete_trip

    now = timezone.now()
    organiser = trip.created_by
    stops = list(Activity.objects.filter(day__trip=trip))
    Activity.objects.filter(day__trip=trip).exclude(status="completed").update(
        status="completed", completed_at=now, completed_by=organiser
    )

    # The photos are the proof: whoever added one was there. They count as
    # checked in at every stop, which is what the completion XP is paid on.
    members = [m.user for m in trip.members.select_related("user")]
    photographers = set(
        Memory.objects.filter(trip=trip).filter(~Q(image="") | ~Q(image_url="")).values_list("user_id", flat=True)
    )
    for user in members:
        if user.id not in photographers:
            continue
        for stop in stops:
            StopCheckIn.objects.get_or_create(
                activity=stop,
                user=user,
                # An admin confirming the photos stands in for being there on
                # the spot, pinned stop or not.
                defaults={"distance_m": 0, "near_start": near_start(trip, stop)},
            )

    trip.completion_review_status = "approved"
    trip.completion_review_note = note
    trip.completion_reviewed_by = admin
    trip.completion_reviewed_at = now
    trip.finished_early = False
    trip.save(
        update_fields=[
            "completion_review_status",
            "completion_review_note",
            "completion_reviewed_by",
            "completion_reviewed_at",
            "finished_early",
            "updated_at",
        ]
    )
    complete_trip(trip, organiser, members)
    for user in members:
        evaluate_achievements(user, trip=trip)
    notify_many(
        members,
        "completion_reviewed",
        f"{trip.title} is complete ✅",
        actor=admin,
        body=note or "An admin confirmed the trip from its photos.",
        trip=trip,
    )


def reject_completion(trip, admin, note):
    from notifications.services import notify

    trip.completion_review_status = "rejected"
    trip.completion_review_note = note
    trip.completion_reviewed_by = admin
    trip.completion_reviewed_at = timezone.now()
    trip.save(
        update_fields=[
            "completion_review_status",
            "completion_review_note",
            "completion_reviewed_by",
            "completion_reviewed_at",
            "updated_at",
        ]
    )
    notify(
        trip.created_by,
        "completion_reviewed",
        f"{trip.title} couldn't be confirmed yet",
        actor=admin,
        body=note,
        trip=trip,
    )


# --- Admin queue ------------------------------------------------------------------


class AdminCompletionSerializer(AdminPastTripSerializer):
    """A completion request in the same shape as a past trip in review, so the
    one admin review screen handles both: review_* come from completion_*,
    and the organiser's message stands in for the story."""

    review_status = serializers.CharField(source="completion_review_status")
    review_note = serializers.CharField(source="completion_review_note")
    submitted_at = serializers.DateTimeField(source="completion_requested_at")
    reviewed_at = serializers.DateTimeField(source="completion_reviewed_at")
    reviewed_by = UserMiniSerializer(source="completion_reviewed_by", read_only=True)

    def get_story(self, obj):
        if not obj.completion_request_note:
            return None
        return {"text": obj.completion_request_note, "is_public": False}


def _requests():
    return Trip.objects.filter(is_past=False).exclude(completion_review_status="").select_related(
        "created_by", "completion_reviewed_by"
    )


def pending_count() -> int:
    return Trip.objects.filter(is_past=False, completion_review_status="pending").count()


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_completion_requests(request):
    """The queue, newest first. ?status=pending|approved|rejected|all, ?q=<name>."""
    trips = _requests()
    wanted = request.query_params.get("status", "pending")
    if wanted in {"pending", "approved", "rejected"}:
        trips = trips.filter(completion_review_status=wanted)
    query = (request.query_params.get("q") or "").strip()
    if query:
        trips = trips.filter(
            Q(title__icontains=query)
            | Q(destination__icontains=query)
            | Q(created_by__username__icontains=query)
            | Q(created_by__display_name__icontains=query)
        )
    trips = trips.order_by("-completion_requested_at")[:200]
    counts = _requests().aggregate(
        pending=Count("id", filter=Q(completion_review_status="pending")),
        approved=Count("id", filter=Q(completion_review_status="approved")),
        rejected=Count("id", filter=Q(completion_review_status="rejected")),
    )
    return Response(
        {"counts": counts, "results": AdminCompletionSerializer(trips, many=True, context={"request": request}).data}
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_completion_request_detail(request, pk):
    trip = _requests().filter(pk=pk).first()
    if not trip:
        return Response({"detail": "That trip isn't in the queue."}, status=status.HTTP_404_NOT_FOUND)
    return Response(AdminCompletionSerializer(trip, context={"request": request, "full": True}).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_review_completion_request(request, pk):
    """{"decision": "approve" | "reject", "note": "..."} — rejecting needs a note."""
    decision = request.data.get("decision")
    note = str(request.data.get("note") or "").strip()[:300]
    if decision not in {"approve", "reject"}:
        raise ValidationError({"decision": "Approve or reject."})
    with transaction.atomic():
        trip = _requests().select_for_update(of=("self",)).filter(pk=pk).first()
        if not trip:
            return Response({"detail": "That trip isn't in the queue."}, status=status.HTTP_404_NOT_FOUND)
        if trip.completion_review_status != "pending":
            raise ValidationError({"detail": "This trip isn't waiting for review any more."})
        if decision == "approve":
            approve_completion(trip, request.user, note)
        else:
            if not note:
                raise ValidationError({"note": "Say why, so they know what to add."})
            reject_completion(trip, request.user, note)
    trip.refresh_from_db()
    return Response(AdminCompletionSerializer(trip, context={"request": request, "full": True}).data)
