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

from datetime import timedelta

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


# An approval runs in one transaction, so everything it paid is stamped within
# moments of its decision time.
APPROVAL_WINDOW = timedelta(minutes=2)


def undo_approval_extras(trip, decided_at, users) -> None:
    """Take back what an approval paid beyond the stops and completion bonuses:
    the organiser's planning XP, achievements it unlocked (they can unlock
    again), and referral XP a first finished trip paid to whoever invited
    someone. Everything stays re-earnable when the trip is approved again."""
    from rewards.models import UserAchievement, XPTransaction
    from rewards.services import award_xp

    if decided_at is None:
        return
    until = decided_at + APPROVAL_WINDOW
    window = {"created_at__gte": decided_at - timedelta(seconds=5), "created_at__lte": until}

    planned = XPTransaction.objects.filter(trip=trip, reason=f"Planned {trip.title}", amount__gt=0, **window)
    for txn in planned:
        award_xp(txn.user, -txn.amount, f"Planned {trip.title}", kind="trip", trip=trip, capped=False)

    unlocked = UserAchievement.objects.filter(
        trip=trip, user__in=users, unlocked_at__gte=decided_at - timedelta(seconds=5), unlocked_at__lte=until
    ).select_related("achievement", "user")
    for ua in unlocked:
        paid = XPTransaction.objects.filter(
            user=ua.user, trip=trip, reason=f"Achievement: {ua.achievement.title}", amount__gt=0, **window
        ).first()
        if paid:
            award_xp(
                ua.user, -paid.amount, f"Achievement taken back: {ua.achievement.title}",
                kind="bonus", trip=trip, achievement=True,
            )
        ua.delete()

    referred = get_user_model().objects.filter(
        pk__in=[u.pk for u in users],
        referred_by__isnull=False,
        referral_paid_at__gte=decided_at - timedelta(seconds=5),
        referral_paid_at__lte=until,
    ).select_related("referred_by")
    for user in referred:
        paid = XPTransaction.objects.filter(
            user=user.referred_by, reason=f"Referred {user.name} to Safar", amount__gt=0
        ).order_by("-created_at").first()
        if paid:
            award_xp(user.referred_by, -paid.amount, f"Referral taken back: {user.name}", kind="bonus", capped=False)
        user.referral_paid_at = None
        user.save(update_fields=["referral_paid_at"])


@transaction.atomic
def reopen_completion(trip, admin):
    """Change a decision: put the trip back in the queue as pending. Undoing
    an approval reverses what it did — the stops it marked done go back to
    planned (taking back their XP and day bonuses), the check-ins it gave
    photographers are removed, completion bonuses are taken back, and the
    trip is live again — so it can be approved or rejected afresh."""
    from notifications.services import notify

    from .attendance import take_back_completion, take_back_stop

    if trip.completion_review_status == "approved":
        decided_at = trip.completion_reviewed_at
        # The stops the approval itself ticked off (stamped with its time).
        by_approval = list(Activity.objects.filter(day__trip=trip, status="completed", completed_at=decided_at))
        StopCheckIn.objects.filter(activity__in=by_approval, distance_m=0, created_at__gte=decided_at).delete()
        for stop in by_approval:
            take_back_stop(stop)
        Activity.objects.filter(pk__in=[s.pk for s in by_approval]).update(
            status="planned", completed_at=None, completed_by=None, xp_value=0, leg_distance_km=None
        )
        if trip.status == "completed":
            take_back_completion(trip)
        undo_approval_extras(trip, decided_at, [m.user for m in trip.members.select_related("user")])
        still_done = Activity.objects.filter(day__trip=trip, status="completed").exists()
        trip.status = "active" if still_done else "planning"
        trip.save(update_fields=["status", "completion_bonus", "organizer_bonus"])

    trip.completion_review_status = "pending"
    trip.completion_review_note = ""
    trip.completion_reviewed_by = None
    trip.completion_reviewed_at = None
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
        f"{trip.title} is back in review",
        actor=admin,
        body="An admin is taking another look at it — you'll hear when it's decided.",
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
    """{"decision": "approve" | "reject" | "reopen", "note": "..."} — rejecting
    needs a note; "reopen" changes an earlier decision (back to pending)."""
    decision = request.data.get("decision")
    note = str(request.data.get("note") or "").strip()[:300]
    if decision not in {"approve", "reject", "reopen"}:
        raise ValidationError({"decision": "Approve, reject or reopen."})
    with transaction.atomic():
        trip = _requests().select_for_update(of=("self",)).filter(pk=pk).first()
        if not trip:
            return Response({"detail": "That trip isn't in the queue."}, status=status.HTTP_404_NOT_FOUND)
        if decision == "reopen":
            if trip.completion_review_status == "pending":
                raise ValidationError({"detail": "It's already waiting for review."})
            reopen_completion(trip, request.user)
            trip.refresh_from_db()
            return Response(AdminCompletionSerializer(trip, context={"request": request, "full": True}).data)
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
