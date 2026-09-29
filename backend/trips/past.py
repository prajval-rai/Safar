"""Past trips: "I've already been there" — a trip logged after the fact.

The traveller builds it like any other trip (destination, dates, itinerary),
adds photos from the trip as proof and, if they like, a story. Then they
submit it and every admin is notified. An admin approves it — the trip is
marked completed, its stops done, the XP paid and a public story shared to the
Feed — or turns it down with a note, and the traveller can fix it and send it
again.

A past trip is never started, run live, finished or cancelled; the review is
its whole lifecycle. The rules (how many photos, XP on approval, …) live in
PastTripConfig and are edited from the admin page.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from accounts.serializers import UserMiniSerializer

from .models import Activity, PastTripConfig, Trip

# Review states in which the traveller can still change the trip.
EDITABLE_STATES = {"draft", "rejected"}


# --- Rules ------------------------------------------------------------------------


class PastTripConfigSerializer(serializers.ModelSerializer):
    updated_by = UserMiniSerializer(read_only=True)

    class Meta:
        model = PastTripConfig
        fields = [
            "enabled",
            "min_photos",
            "max_photos",
            "min_stops",
            "require_story",
            "min_story_chars",
            "allow_public_story",
            "max_age_days",
            "approval_xp",
            "story_xp",
            "updated_by",
            "updated_at",
        ]
        read_only_fields = ["updated_by", "updated_at"]

    def validate_approval_xp(self, value):
        return _check_xp(value)

    def validate_story_xp(self, value):
        return _check_xp(value)

    def validate_max_age_days(self, value):
        if value < 1:
            raise serializers.ValidationError("Allow trips from at least 1 day ago.")
        return value

    def validate_min_story_chars(self, value):
        if value > 5000:
            raise serializers.ValidationError("That's longer than anyone will write — 5000 at most.")
        return value

    def validate(self, attrs):
        low = attrs.get("min_photos", self.instance.min_photos if self.instance else 0)
        high = attrs.get("max_photos", self.instance.max_photos if self.instance else 0)
        if high < 1:
            raise serializers.ValidationError({"max_photos": "Allow at least one photo."})
        if low > high:
            raise serializers.ValidationError(
                {"min_photos": "The photos needed can't be more than the most allowed."}
            )
        return attrs


def _check_xp(value):
    from rewards.services import MAX_REWARD

    if value < 0 or value > MAX_REWARD:
        raise serializers.ValidationError(f"Between 0 and {MAX_REWARD} XP.")
    return value


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def past_trip_config(request):
    """The rules, for anyone signed in (the log-a-past-trip screens show them);
    only admins can change them."""
    config = PastTripConfig.current()
    if request.method == "PATCH":
        if not request.user.is_staff:
            raise PermissionDenied("Only admins can change the past trip rules.")
        serializer = PastTripConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)
    return Response(PastTripConfigSerializer(config).data)


def validate_past_dates(start, end, config=None):
    """A past trip has to be over, and not older than the admins allow."""
    config = config or PastTripConfig.current()
    today = timezone.localdate()
    if end and end >= today:
        raise ValidationError(
            {"end_date": "A past trip has to have ended before today. Plan it as a new trip instead."}
        )
    if end and end < today - timedelta(days=config.max_age_days):
        raise ValidationError(
            {"end_date": f"Past trips can go back {config.max_age_days} days at most."}
        )


# --- Guards used by the regular trip endpoints ----------------------------------


def block_if_past(trip, action="do that"):
    """Past trips aren't run live — no start, finish, cancel, check-in…"""
    if trip.is_past:
        raise ValidationError(
            {"detail": f"You can't {action} on a past trip — it's already happened."}
        )


def block_if_locked(trip):
    """While an admin is looking at a past trip (or once it's approved), its
    itinerary, photos and story stay as they were submitted."""
    if not trip.is_past or trip.review_status in EDITABLE_STATES:
        return
    if trip.review_status == "pending":
        raise ValidationError(
            {"detail": "This trip is waiting for review. Withdraw it first to make changes."}
        )
    raise ValidationError({"detail": "This trip has been approved, so it can't be changed any more."})


def counts_for_stats():
    """Trips that count towards achievements and profiles: every ordinary
    trip, and past trips only once an admin has approved them."""
    return Q(is_past=False) | Q(review_status="approved")


# --- Requirements -----------------------------------------------------------------


def photo_count(trip) -> int:
    return trip.memories.filter(
        (Q(image__isnull=False) & ~Q(image="")) | ~Q(image_url="")
    ).count()


def requirements(trip, config=None) -> list[dict]:
    """What still has to be done before this past trip can be submitted — one
    row per rule, so the screen can show a checklist."""
    config = config or PastTripConfig.current()
    photos = photo_count(trip)
    stops = Activity.objects.filter(day__trip=trip).count()
    story = trip.experiences.filter(user=trip.created_by, skipped=False).first()
    story_len = len(story.text.strip()) if story else 0

    rows = [
        {
            "key": "photos",
            "label": f"Add at least {config.min_photos} photo{'' if config.min_photos == 1 else 's'} from the trip",
            "done": photos >= config.min_photos,
            "have": photos,
            "need": config.min_photos,
        },
        {
            "key": "stops",
            "label": f"Add at least {config.min_stops} stop{'' if config.min_stops == 1 else 's'} to the itinerary",
            "done": stops >= config.min_stops,
            "have": stops,
            "need": config.min_stops,
        },
    ]
    if config.require_story:
        rows.append(
            {
                "key": "story",
                "label": f"Write your story (at least {config.min_story_chars} characters)",
                "done": story_len >= config.min_story_chars,
                "have": story_len,
                "need": config.min_story_chars,
            }
        )
    return rows


def past_trip_info(trip, config=None) -> dict | None:
    """The past-trip block of a trip's detail payload, or None for a normal trip."""
    if not trip.is_past:
        return None
    config = config or PastTripConfig.current()
    story = trip.experiences.filter(user=trip.created_by, skipped=False).first()
    return {
        "review_status": trip.review_status,
        "review_note": trip.review_note,
        "submitted_at": trip.submitted_at,
        "reviewed_at": trip.reviewed_at,
        "reviewed_by": UserMiniSerializer(trip.reviewed_by).data if trip.reviewed_by else None,
        "requirements": requirements(trip, config),
        "photo_count": photo_count(trip),
        "max_photos": config.max_photos,
        "has_story": bool(story and story.text.strip()),
        "story_public": bool(story and story.is_public),
        "allow_public_story": config.allow_public_story,
        "approval_xp": config.approval_xp,
        "story_xp": config.story_xp,
        "editable": trip.review_status in EDITABLE_STATES,
    }


# --- Traveller: submit and withdraw ------------------------------------------------


def _admins(exclude=None):
    admins = get_user_model().objects.filter(is_staff=True, is_active=True)
    if exclude is not None:
        admins = admins.exclude(pk=exclude.pk)
    return list(admins)


def submit_for_review(trip, user):
    from notifications.services import notify_many

    if not trip.is_past:
        raise ValidationError({"detail": "Only past trips go through review."})
    if trip.created_by_id != user.id:
        raise PermissionDenied("Only the person who logged this trip can submit it.")
    if trip.review_status == "pending":
        raise ValidationError({"detail": "It's already waiting for review."})
    if trip.review_status == "approved":
        raise ValidationError({"detail": "This trip has already been approved."})
    config = PastTripConfig.current()
    if not config.enabled:
        raise ValidationError({"detail": "Past trips aren't being accepted right now."})
    missing = [row["label"] for row in requirements(trip, config) if not row["done"]]
    if missing:
        raise ValidationError({"detail": f"Not yet — {missing[0][0].lower()}{missing[0][1:]}."})

    trip.review_status = "pending"
    trip.submitted_at = timezone.now()
    trip.save(update_fields=["review_status", "submitted_at", "updated_at"])
    notify_many(
        _admins(exclude=user),
        "past_trip_submitted",
        f"{user.name} logged a past trip: {trip.title}",
        actor=user,
        body=f"{trip.destination} · {photo_count(trip)} photos. Open the admin page to review it.",
        trip=trip,
        url="/manage?tab=past",
    )


def withdraw_review(trip, user):
    if not trip.is_past or trip.created_by_id != user.id:
        raise PermissionDenied("Only the person who logged this trip can withdraw it.")
    if trip.review_status != "pending":
        raise ValidationError({"detail": "It isn't waiting for review."})
    trip.review_status = "draft"
    trip.submitted_at = None
    trip.save(update_fields=["review_status", "submitted_at", "updated_at"])


# --- Admin: review ----------------------------------------------------------------


@transaction.atomic
def approve(trip, admin, note=""):
    from notifications.services import notify
    from rewards.services import award_xp, evaluate_achievements

    from .views import share_experience_to_feed

    config = PastTripConfig.current()
    now = timezone.now()
    owner = trip.created_by

    # It happened: every stop is done, the trip is completed.
    Activity.objects.filter(day__trip=trip).exclude(status="completed").update(
        status="completed", completed_at=now, completed_by=owner
    )
    trip.status = "completed"
    trip.review_status = "approved"
    trip.review_note = note
    trip.reviewed_by = admin
    trip.reviewed_at = now
    trip.save(
        update_fields=[
            "status",
            "review_status",
            "review_note",
            "reviewed_by",
            "reviewed_at",
            "updated_at",
        ]
    )

    # Approval is final (only a pending trip can be approved), so this is
    # only ever paid once per trip.
    paid = award_xp(owner, config.approval_xp, f"Past trip approved: {trip.title}", kind="trip", trip=trip)
    story = trip.experiences.filter(user=owner, skipped=False).exclude(text="").first()
    if story:
        award_xp(owner, config.story_xp, f"Wrote about {trip.title}", kind="bonus", trip=trip)
        if story.is_public and config.allow_public_story:
            share_experience_to_feed(story)
    evaluate_achievements(owner, trip=trip)

    xp_line = ""
    total = (config.approval_xp if paid else 0) + (config.story_xp if story else 0)
    if total:
        from rewards.services import format_xp

        xp_line = f" +{format_xp(total)} XP."
    notify(
        owner,
        "past_trip_reviewed",
        f"{trip.title} was approved ✅",
        actor=admin,
        body=(note or "It's on your profile now.") + xp_line,
        trip=trip,
    )


def reject(trip, admin, note):
    from notifications.services import notify

    trip.review_status = "rejected"
    trip.review_note = note
    trip.reviewed_by = admin
    trip.reviewed_at = timezone.now()
    trip.save(update_fields=["review_status", "review_note", "reviewed_by", "reviewed_at", "updated_at"])
    notify(
        trip.created_by,
        "past_trip_reviewed",
        f"{trip.title} needs another look",
        actor=admin,
        body=note or "An admin couldn't approve it. Make changes and send it again.",
        trip=trip,
    )


class AdminPastTripSerializer(serializers.ModelSerializer):
    """A past trip as the review queue shows it: the trip, its itinerary, its
    photos and story — everything an admin needs to decide."""

    created_by = UserMiniSerializer(read_only=True)
    reviewed_by = UserMiniSerializer(read_only=True)
    duration_days = serializers.IntegerField(read_only=True)
    photos = serializers.SerializerMethodField()
    days = serializers.SerializerMethodField()
    story = serializers.SerializerMethodField()
    stop_count = serializers.SerializerMethodField()
    photo_count = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id",
            "title",
            "destination",
            "region",
            "summary",
            "cover_key",
            "start_date",
            "end_date",
            "duration_days",
            "trip_type",
            "transport",
            "budget_per_person",
            "created_by",
            "review_status",
            "review_note",
            "submitted_at",
            "reviewed_at",
            "reviewed_by",
            "stop_count",
            "photo_count",
            "photos",
            "days",
            "story",
            "created_at",
        ]

    def get_stop_count(self, obj) -> int:
        return Activity.objects.filter(day__trip=obj).count()

    def get_photo_count(self, obj) -> int:
        return photo_count(obj)

    def get_photos(self, obj) -> list[dict]:
        from .media import memory_photo_url

        request = self.context.get("request")
        return [
            {"id": str(m.id), "url": memory_photo_url(m, request), "caption": m.caption}
            for m in obj.memories.order_by("created_at")
            if m.image or m.image_url
        ]

    def get_days(self, obj) -> list[dict]:
        if not self.context.get("full"):
            return []
        return [
            {
                "index": day.index,
                "date": day.date,
                "title": day.title,
                "notes": day.notes,
                "stops": [
                    {
                        "id": str(a.id),
                        "title": a.title,
                        "category": a.category,
                        "place_name": a.place_name,
                        "start_time": a.start_time,
                        "notes": a.notes,
                        "cost": a.cost,
                    }
                    for a in day.activities.all()
                ],
            }
            for day in obj.days.prefetch_related("activities")
        ]

    def get_story(self, obj):
        story = obj.experiences.filter(user=obj.created_by, skipped=False).exclude(text="").first()
        if not story:
            return None
        return {"text": story.text, "is_public": story.is_public}


def _past_trips():
    return Trip.objects.filter(is_past=True).exclude(review_status="draft").select_related(
        "created_by", "reviewed_by"
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_past_trips(request):
    """The review queue, newest submission first. ?status=pending|approved|rejected|all, ?q=<name>."""
    trips = _past_trips()
    wanted = request.query_params.get("status", "pending")
    if wanted in {"pending", "approved", "rejected"}:
        trips = trips.filter(review_status=wanted)
    query = (request.query_params.get("q") or "").strip()
    if query:
        trips = trips.filter(
            Q(title__icontains=query)
            | Q(destination__icontains=query)
            | Q(created_by__username__icontains=query)
            | Q(created_by__display_name__icontains=query)
            | Q(created_by__email__icontains=query)
        )
    trips = trips.order_by("-submitted_at", "-created_at")[:200]
    counts = _past_trips().aggregate(
        pending=Count("id", filter=Q(review_status="pending")),
        approved=Count("id", filter=Q(review_status="approved")),
        rejected=Count("id", filter=Q(review_status="rejected")),
    )
    return Response(
        {
            "counts": counts,
            "results": AdminPastTripSerializer(trips, many=True, context={"request": request}).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_past_trip_detail(request, pk):
    trip = _past_trips().filter(pk=pk).first()
    if not trip:
        return Response({"detail": "That trip isn't in the review queue."}, status=status.HTTP_404_NOT_FOUND)
    return Response(AdminPastTripSerializer(trip, context={"request": request, "full": True}).data)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_review_past_trip(request, pk):
    """{"decision": "approve" | "reject", "note": "..."} — a note is needed to
    reject, so the traveller knows what to fix."""
    decision = request.data.get("decision")
    note = str(request.data.get("note") or "").strip()[:300]
    if decision not in {"approve", "reject"}:
        raise ValidationError({"decision": "Approve or reject."})
    with transaction.atomic():
        trip = _past_trips().select_for_update(of=("self",)).filter(pk=pk).first()
        if not trip:
            return Response({"detail": "That trip isn't in the review queue."}, status=status.HTTP_404_NOT_FOUND)
        if trip.review_status != "pending":
            raise ValidationError({"detail": "This trip isn't waiting for review any more."})
        if decision == "approve":
            approve(trip, request.user, note)
        else:
            if not note:
                raise ValidationError({"note": "Say why, so they know what to fix."})
            reject(trip, request.user, note)
    trip.refresh_from_db()
    return Response(AdminPastTripSerializer(trip, context={"request": request, "full": True}).data)


def pending_count() -> int:
    return Trip.objects.filter(is_past=True, review_status="pending").count()

