from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Prefetch, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.serializers import UserSerializer
from notifications.services import notify, notify_many
from rewards.services import (
    CHECKIN_XP,
    DAY_COMPLETE_BONUS,
    MEMORY_XP,
    TRIP_COMPLETE_BONUS,
    award_xp,
    evaluate_achievements,
)

from .catalog import DESTINATIONS, TRIP_TYPE_DEFAULTS, find_destination, plan_for_day
from .geo import distance_from_stop
from .models import (
    Activity,
    ChatMessage,
    ChecklistItem,
    Day,
    Expense,
    Memory,
    Trip,
    TripMember,
)
from .serializers import (
    ActivitySerializer,
    ChatMessageSerializer,
    ChecklistItemSerializer,
    DaySerializer,
    ExpenseSerializer,
    MemorySerializer,
    TripCreateSerializer,
    TripDetailSerializer,
    TripListSerializer,
    TripMemberSerializer,
)


def trips_for(user):
    return Trip.objects.filter(members__user=user).distinct()


def ensure_can_go_live(trip, user):
    """A trip can only be live if it is unfinished and nobody on it is already on
    another live trip — one journey at a time."""
    if trip.status == "completed":
        raise ValidationError({"detail": "This trip is already finished."})
    if trip.status == "cancelled":
        raise ValidationError({"detail": "This trip was cancelled. Reopen it first if you still want to go."})
    clash = (
        Trip.objects.filter(status="active", members__user__in=trip.members.values("user"))
        .exclude(pk=trip.pk)
        .distinct()
        .first()
    )
    if clash:
        mine = clash.members.filter(user=user).exists()
        raise ValidationError(
            {
                "detail": (
                    f"You already have a live trip: {clash.title}. Finish or cancel it before starting another."
                    if mine
                    else f"Someone on this trip is already on a live trip ({clash.title})."
                )
            }
        )


def has_pin(activity) -> bool:
    return activity.latitude is not None and activity.longitude is not None


def require_member(trip, user, editors_only=False):
    member = trip.members.filter(user=user).first()
    if not member:
        raise PermissionDenied("You're not part of this trip.")
    if editors_only and member.role == "member":
        raise PermissionDenied("Only the trip owner or a co-planner can do this.")
    return member


def xp_result(user, extra=None):
    """Standard payload so the UI can show the right celebration."""
    payload = {"user": UserSerializer(user).data}
    payload.update(extra or {})
    return payload


class TripViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TripListSerializer
    filterset_fields = ["status", "trip_type", "region"]
    search_fields = ["title", "destination", "region"]

    def get_queryset(self):
        qs = trips_for(self.request.user).select_related("created_by")
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                Prefetch(
                    "days",
                    queryset=Day.objects.prefetch_related(
                        Prefetch("activities", queryset=Activity.objects.select_related("completed_by"))
                    ),
                ),
                "members__user",
            )
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TripDetailSerializer
        if self.action in {"create", "update", "partial_update"}:
            return TripCreateSerializer
        return TripListSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        invites = serializer.validated_data.pop("invite_usernames", [])
        trip = serializer.save(created_by=self.request.user)
        TripMember.objects.create(trip=trip, user=self.request.user, role="owner")

        # One Day row per calendar date so the itinerary is ready to fill in.
        for offset in range(trip.duration_days):
            Day.objects.create(
                trip=trip, index=offset + 1, date=trip.start_date + timedelta(days=offset)
            )

        if invites:
            from django.contrib.auth import get_user_model

            User = get_user_model()
            for username in invites:
                friend = User.objects.filter(username__iexact=username.strip()).first()
                if friend and friend != self.request.user:
                    TripMember.objects.get_or_create(trip=trip, user=friend)
        self._created_trip = trip

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        trip = self._created_trip
        detail = TripDetailSerializer(trip, context=self.get_serializer_context())
        return Response(detail.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        require_member(self.get_object(), self.request.user, editors_only=True)
        trip = serializer.save()
        self._resync_days(trip)

    def perform_destroy(self, instance):
        member = require_member(instance, self.request.user)
        if member.role != "owner":
            raise PermissionDenied("Only the trip owner can delete this trip.")
        instance.delete()

    @staticmethod
    def _resync_days(trip):
        """Keep Day rows in step when the traveller changes the dates."""
        wanted = trip.duration_days
        existing = list(trip.days.order_by("index"))
        for offset in range(wanted):
            target_date = trip.start_date + timedelta(days=offset)
            if offset < len(existing):
                day = existing[offset]
                if day.date != target_date or day.index != offset + 1:
                    day.date, day.index = target_date, offset + 1
                    day.save(update_fields=["date", "index"])
            else:
                Day.objects.create(trip=trip, index=offset + 1, date=target_date)
        # Only drop trailing days that nobody has planned anything in.
        for day in existing[wanted:]:
            if not day.activities.exists():
                day.delete()

    # --- Itinerary ---------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="generate-plan")
    def generate_plan(self, request, pk=None):
        """Fill a day (or the whole trip) with an editable suggested plan."""
        trip = self.get_object()
        require_member(trip, request.user, editors_only=True)
        day_index = request.data.get("day_index")
        replace = bool(request.data.get("replace", False))

        days = trip.days.all()
        if day_index:
            days = days.filter(index=day_index)
        if not days:
            raise ValidationError({"day_index": "That day isn't part of this trip."})

        created = 0
        for day in days:
            if day.activities.exists():
                if not replace:
                    continue
                day.activities.all().delete()
            stops = plan_for_day(trip.destination, trip.cover_key, day.index, trip.pace)
            for order, stop in enumerate(stops):
                Activity.objects.create(day=day, order=order, **stop)
                created += 1

        trip.refresh_from_db()
        return Response(
            {
                "created": created,
                "trip": TripDetailSerializer(trip, context=self.get_serializer_context()).data,
            }
        )

    @action(detail=True, methods=["get", "post"])
    def days(self, request, pk=None):
        trip = self.get_object()
        if request.method == "POST":
            require_member(trip, request.user, editors_only=True)
            last = trip.days.order_by("-index").first()
            index = (last.index + 1) if last else 1
            day = Day.objects.create(
                trip=trip,
                index=index,
                date=trip.start_date + timedelta(days=index - 1),
                title=request.data.get("title", ""),
            )
            if day.date > trip.end_date:
                trip.end_date = day.date
                trip.save(update_fields=["end_date"])
            return Response(DaySerializer(day).data, status=status.HTTP_201_CREATED)
        return Response(DaySerializer(trip.days.all(), many=True).data)

    # --- People ------------------------------------------------------------

    @action(detail=True, methods=["get", "post"])
    def members(self, request, pk=None):
        trip = self.get_object()
        if request.method == "POST":
            require_member(trip, request.user, editors_only=True)
            from django.contrib.auth import get_user_model

            User = get_user_model()
            username = (request.data.get("username") or "").strip()
            friend = User.objects.filter(username__iexact=username).first()
            if not friend:
                raise ValidationError({"username": f"No traveller named '{username}' yet."})
            member, created = TripMember.objects.get_or_create(trip=trip, user=friend)
            if created:
                notify(
                    friend,
                    "trip_member_added",
                    f"You're on {trip.title}",
                    actor=request.user,
                    body=f"{request.user.display_name or request.user.username} added you to a trip to {trip.destination}.",
                    trip=trip,
                )
            return Response(
                TripMemberSerializer(member).data,
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        return Response(TripMemberSerializer(trip.members.select_related("user"), many=True).data)

    @action(detail=True, methods=["delete"], url_path="members/(?P<member_id>[^/.]+)")
    def remove_member(self, request, pk=None, member_id=None):
        trip = self.get_object()
        require_member(trip, request.user, editors_only=True)
        member = get_object_or_404(TripMember, pk=member_id, trip=trip)
        if member.role == "owner":
            raise ValidationError({"detail": "The trip owner can't be removed."})
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --- Live trip ---------------------------------------------------------

    @action(detail=True, methods=["get"])
    def live(self, request, pk=None):
        """Only what the traveller needs right now: NOW, NEXT, TODAY, GROUP."""
        trip = self.get_object()
        day = trip.current_day()
        activities = list(day.activities.all()) if day else []
        pending = [a for a in activities if a.status == "planned"]

        now_time = timezone.localtime().time()
        current = None
        for activity in pending:
            if activity.start_time and activity.end_time:
                if activity.start_time <= now_time <= activity.end_time:
                    current = activity
                    break
        if current is None:
            current = pending[0] if pending else None
        upcoming = next((a for a in pending if a != current), None)

        my_xp = (
            Activity.objects.filter(day__trip=trip, completed_by=request.user).aggregate(
                total=Sum("xp_value")
            )["total"]
            or 0
        )

        payload = {
            "trip": TripListSerializer(trip, context=self.get_serializer_context()).data,
            "day": DaySerializer(day).data if day else None,
            "now": ActivitySerializer(current).data if current else None,
            "next": ActivitySerializer(upcoming).data if upcoming else None,
            "completed_today": sum(1 for a in activities if a.status == "completed"),
            "total_today": len(activities),
            "members": TripMemberSerializer(trip.members.select_related("user"), many=True).data,
            "my_trip_xp": my_xp,
        }
        return Response(payload)

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        """Powers the trip completion screen."""
        trip = self.get_object()
        activities = Activity.objects.filter(day__trip=trip)
        completed = activities.filter(status="completed")
        places = list(
            completed.exclude(place_name="").values_list("place_name", flat=True).distinct()
        )
        route = [trip.destination]
        for day in trip.days.all():
            first = day.activities.exclude(place_name="").first()
            if first and first.place_name not in route:
                route.append(first.place_name)

        spend = trip.expenses.aggregate(total=Sum("amount"))["total"] or 0
        leaderboard = sorted(
            (
                {
                    "user": TripMemberSerializer(m).data["user"],
                    "xp": m.xp_earned,
                    "progress": m.progress_percent,
                }
                for m in trip.members.select_related("user")
            ),
            key=lambda row: -row["xp"],
        )

        return Response(
            {
                "trip": TripListSerializer(trip, context=self.get_serializer_context()).data,
                "days": trip.duration_days,
                "locations": len(places),
                "activities_completed": completed.count(),
                "activities_total": activities.count(),
                "xp": trip.total_xp,
                "total_spend": spend,
                "spend_per_person": round(spend / max(trip.members.count(), 1)),
                "route": route[:6],
                "leaderboard": leaderboard,
                "memories": MemorySerializer(trip.memories.all()[:12], many=True).data,
            }
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        trip = self.get_object()
        require_member(trip, request.user, editors_only=True)
        if trip.status == "active":
            return Response(TripListSerializer(trip, context=self.get_serializer_context()).data)
        ensure_can_go_live(trip, request.user)
        trip.status = "active"
        trip.save(update_fields=["status"])
        others = [m.user for m in trip.members.exclude(user=request.user).select_related("user")]
        notify_many(
            others,
            "trip_started",
            f"{trip.title} has started!",
            actor=request.user,
            body=f"{request.user.display_name or request.user.username} kicked things off.",
            trip=trip,
        )
        return Response(TripListSerializer(trip, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Call the trip off. Finished trips can't be cancelled; XP already earned stays."""
        trip = self.get_object()
        require_member(trip, request.user, editors_only=True)
        if trip.status == "completed":
            raise ValidationError({"detail": "A finished trip can't be cancelled."})
        trip.status = "cancelled"
        trip.save(update_fields=["status"])
        return Response(TripListSerializer(trip, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Put a cancelled trip back to planning."""
        trip = self.get_object()
        require_member(trip, request.user, editors_only=True)
        if trip.status != "cancelled":
            raise ValidationError({"detail": "Only a cancelled trip can be reopened."})
        trip.status = "planning"
        trip.save(update_fields=["status"])
        return Response(TripListSerializer(trip, context=self.get_serializer_context()).data)

    # --- Advanced sections -------------------------------------------------

    @action(detail=True, methods=["get", "post"])
    def expenses(self, request, pk=None):
        trip = self.get_object()
        require_member(trip, request.user)
        if request.method == "POST":
            serializer = ExpenseSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(trip=trip, paid_by=serializer.validated_data.get("paid_by", request.user))
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        expenses = trip.expenses.select_related("paid_by")
        total = expenses.aggregate(total=Sum("amount"))["total"] or 0
        head_count = max(trip.members.count(), 1)
        per_person = []
        for member in trip.members.select_related("user"):
            paid = expenses.filter(paid_by=member.user).aggregate(total=Sum("amount"))["total"] or 0
            per_person.append(
                {
                    "user": TripMemberSerializer(member).data["user"],
                    "paid": paid,
                    "share": round(total / head_count),
                    "balance": paid - round(total / head_count),
                }
            )
        return Response(
            {
                "results": ExpenseSerializer(expenses, many=True).data,
                "total": total,
                "per_person_share": round(total / head_count),
                "balances": per_person,
            }
        )

    @action(detail=True, methods=["get", "post"])
    def checklist(self, request, pk=None):
        trip = self.get_object()
        require_member(trip, request.user)
        if request.method == "POST":
            serializer = ChecklistItemSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(trip=trip)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(
            ChecklistItemSerializer(trip.checklist.select_related("assigned_to"), many=True).data
        )

    @action(detail=True, methods=["get", "post"])
    def memories(self, request, pk=None):
        trip = self.get_object()
        require_member(trip, request.user)
        if request.method == "POST":
            serializer = MemorySerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(trip=trip, user=request.user)
            award_xp(request.user, MEMORY_XP, "Added a memory", kind="photo", trip=trip)
            unlocked = evaluate_achievements(request.user, trip=trip)
            request.user.refresh_from_db()
            return Response(
                {
                    **serializer.data,
                    **xp_result(
                        request.user,
                        {
                            "xp_awarded": MEMORY_XP,
                            "unlocked": [
                                {"title": a.title, "icon": a.icon} for a in unlocked
                            ],
                        },
                    ),
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(MemorySerializer(trip.memories.select_related("user"), many=True).data)

    @action(detail=True, methods=["get", "post"])
    def chat(self, request, pk=None):
        trip = self.get_object()
        require_member(trip, request.user)
        if request.method == "POST":
            serializer = ChatMessageSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(trip=trip, user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(
            ChatMessageSerializer(trip.messages.select_related("user")[:200], many=True).data
        )


class DayViewSet(viewsets.GenericViewSet):
    """Days are always reached through their trip, so only detail routes exist."""

    permission_classes = [IsAuthenticated]
    serializer_class = DaySerializer

    def get_queryset(self):
        return Day.objects.filter(trip__members__user=self.request.user).distinct()

    def retrieve(self, request, pk=None):
        day = self.get_object()
        return Response(DaySerializer(day).data)

    def partial_update(self, request, pk=None):
        day = self.get_object()
        require_member(day.trip, request.user, editors_only=True)
        serializer = DaySerializer(day, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def activities(self, request, pk=None):
        day = self.get_object()
        require_member(day.trip, request.user, editors_only=True)
        serializer = ActivitySerializer(data={**request.data, "day": day.pk})
        serializer.is_valid(raise_exception=True)
        last = day.activities.order_by("-order").first()
        serializer.save(order=(last.order + 1) if last else 0)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ActivityViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ActivitySerializer

    def get_queryset(self):
        return (
            Activity.objects.filter(day__trip__members__user=self.request.user)
            .select_related("day", "day__trip", "completed_by")
            .distinct()
        )

    def perform_update(self, serializer):
        require_member(serializer.instance.day.trip, self.request.user, editors_only=True)
        serializer.save()

    def perform_destroy(self, instance):
        require_member(instance.day.trip, self.request.user, editors_only=True)
        instance.delete()

    @action(detail=True, methods=["post"])
    def checkin(self, request, pk=None):
        activity = self.get_object()
        require_member(activity.day.trip, request.user)
        if activity.day.trip.status == "cancelled":
            raise ValidationError({"detail": "This trip was cancelled."})
        if activity.checked_in_at:
            return Response(xp_result(request.user, {"already_checked_in": True}))
        # A check-in means "I'm here", so it always needs a real location when the
        # stop is pinned. (Organisers can override completion, but not this.)
        if has_pin(activity):
            distance_from_stop(activity, request.data)
        activity.checked_in_at = timezone.now()
        activity.save(update_fields=["checked_in_at"])
        award_xp(
            request.user,
            CHECKIN_XP,
            f"Checked in at {activity.place_name or activity.title}",
            kind="checkin",
            trip=activity.day.trip,
        )
        request.user.refresh_from_db()
        return Response(
            xp_result(
                request.user,
                {"xp_awarded": CHECKIN_XP, "activity": ActivitySerializer(activity).data},
            )
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def complete(self, request, pk=None):
        activity = self.get_object()
        trip = activity.day.trip
        member = require_member(trip, request.user)
        is_organiser = member.role in ("owner", "admin")
        if activity.status == "completed":
            return Response(
                xp_result(request.user, {"activity": ActivitySerializer(activity).data})
            )
        # Doing the first stop is what starts a trip, so the one-live-trip rule applies here too.
        if trip.status == "planning":
            ensure_can_go_live(trip, request.user)
        elif trip.status in ("completed", "cancelled"):
            raise ValidationError({"detail": "This trip is " + trip.status + "."})

        # An assigned stop belongs to one person; organisers can always step in.
        if activity.assigned_to_id and activity.assigned_to_id != request.user.id and not is_organiser:
            raise PermissionDenied(f"This stop is assigned to {activity.assigned_to.name}.")

        if activity.requires_photo and not activity.memories.exists():
            raise ValidationError(
                {"detail": "Add a photo of this stop before marking it done."}
            )
        if activity.requires_checkin and not activity.checked_in_at:
            raise ValidationError({"detail": "Check in at this place first."})

        # Where the traveller is decides whether this counts as "been there":
        #  - override (organiser only): completes from anywhere, not location-verified
        #  - pinned stop: must be within 1 km, and is then location-verified
        #  - unpinned stop: nothing to measure against, so it just completes
        distance_km = None
        if request.data.get("override"):
            if not is_organiser:
                raise PermissionDenied(
                    "Only the trip organiser can mark a stop complete from somewhere else."
                )
        elif has_pin(activity):
            distance_km = distance_from_stop(activity, request.data)

        activity.status = "completed"
        activity.completed_at = timezone.now()
        activity.completed_by = request.user
        activity.verified_by_location = distance_km is not None
        activity.completed_distance_m = round(distance_km * 1000) if distance_km is not None else None
        activity.save(
            update_fields=[
                "status",
                "completed_at",
                "completed_by",
                "verified_by_location",
                "completed_distance_m",
            ]
        )

        xp = activity.xp_value
        award_xp(request.user, xp, f"Completed {activity.title}", kind="activity", trip=trip)

        day = activity.day
        day_completed = day.is_complete
        if day_completed:
            award_xp(
                request.user,
                DAY_COMPLETE_BONUS,
                f"Finished day {day.index}",
                kind="day",
                trip=trip,
            )
            xp += DAY_COMPLETE_BONUS

        trip_completed = False
        remaining = Activity.objects.filter(day__trip=trip, status="planned").count()
        if remaining == 0 and trip.status != "completed":
            trip.status = "completed"
            trip.save(update_fields=["status"])
            trip_completed = True
            award_xp(
                request.user, TRIP_COMPLETE_BONUS, f"Completed {trip.title}", kind="trip", trip=trip
            )
            xp += TRIP_COMPLETE_BONUS
        elif trip.status == "planning":
            trip.status = "active"
            trip.save(update_fields=["status"])

        unlocked = evaluate_achievements(request.user, trip=trip)
        request.user.refresh_from_db()
        activity.refresh_from_db()
        return Response(
            xp_result(
                request.user,
                {
                    "activity": ActivitySerializer(activity).data,
                    "xp_awarded": xp,
                    "day_completed": day_completed,
                    "day_index": day.index,
                    "trip_completed": trip_completed,
                    "unlocked": [{"title": a.title, "icon": a.icon} for a in unlocked],
                },
            )
        )

    @action(detail=True, methods=["post"])
    def undo(self, request, pk=None):
        """Marked something done by mistake — give the XP back."""
        activity = self.get_object()
        trip = activity.day.trip
        require_member(trip, request.user)
        if activity.status != "completed":
            return Response(xp_result(request.user, {"activity": ActivitySerializer(activity).data}))
        # Only whoever completed it, or an organiser, can take it back.
        member = require_member(trip, request.user)
        if member.role == "member" and activity.completed_by_id != request.user.id:
            raise PermissionDenied("Only the person who completed this, or an organiser, can undo it.")
        owner = activity.completed_by or request.user
        award_xp(owner, -activity.xp_value, f"Undid {activity.title}", kind="activity", trip=trip)
        activity.status = "planned"
        activity.completed_at = None
        activity.completed_by = None
        activity.verified_by_location = False
        activity.completed_distance_m = None
        activity.save(
            update_fields=[
                "status",
                "completed_at",
                "completed_by",
                "verified_by_location",
                "completed_distance_m",
            ]
        )
        if trip.status == "completed":
            others_live = (
                Trip.objects.filter(status="active", members__user__in=trip.members.values("user"))
                .exclude(pk=trip.pk)
                .exists()
            )
            trip.status = "planning" if others_live else "active"
            trip.save(update_fields=["status"])
        request.user.refresh_from_db()
        return Response(
            xp_result(request.user, {"activity": ActivitySerializer(activity).data})
        )

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """Hand a stop to a trip member (or send `user_id: null` to un-assign)."""
        activity = self.get_object()
        trip = activity.day.trip
        require_member(trip, request.user, editors_only=True)
        user_id = request.data.get("user_id")

        if user_id in (None, "", 0):
            activity.assigned_to = None
        else:
            member = trip.members.select_related("user").filter(user_id=user_id).first()
            if not member:
                raise ValidationError({"user_id": "That person isn't on this trip."})
            if activity.status == "completed":
                raise ValidationError({"detail": "This stop is already done."})
            activity.assigned_to = member.user
        activity.save(update_fields=["assigned_to"])
        return Response(ActivitySerializer(activity).data)

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """Mobile-friendly alternative to drag and drop."""
        activity = self.get_object()
        trip = activity.day.trip
        require_member(trip, request.user, editors_only=True)
        direction = request.data.get("direction")
        day_index = request.data.get("day_index")

        if day_index:
            target = trip.days.filter(index=day_index).first()
            if not target:
                raise ValidationError({"day_index": "That day isn't part of this trip."})
            last = target.activities.order_by("-order").first()
            activity.day = target
            activity.order = (last.order + 1) if last else 0
            activity.save(update_fields=["day", "order"])
        elif direction in {"up", "down"}:
            siblings = list(activity.day.activities.order_by("order", "start_time", "created_at"))
            index = next(i for i, a in enumerate(siblings) if a.pk == activity.pk)
            swap_with = index - 1 if direction == "up" else index + 1
            if 0 <= swap_with < len(siblings):
                other = siblings[swap_with]
                siblings[index], siblings[swap_with] = other, activity
                for order, item in enumerate(siblings):
                    if item.order != order:
                        item.order = order
                        item.save(update_fields=["order"])
        else:
            raise ValidationError({"detail": "Send either direction=up/down or day_index."})

        activity.refresh_from_db()
        return Response(ActivitySerializer(activity).data)


class ExpenseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        return Expense.objects.filter(trip__members__user=self.request.user).distinct()


class ChecklistItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ChecklistItemSerializer

    def get_queryset(self):
        return ChecklistItem.objects.filter(trip__members__user=self.request.user).distinct()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def join_trip(request):
    code = (request.data.get("code") or "").strip().upper()
    trip = Trip.objects.filter(join_code=code).first()
    if not trip:
        raise ValidationError({"code": "That invite code didn't match any trip."})
    _, created = TripMember.objects.get_or_create(trip=trip, user=request.user)
    if created:
        organisers = [m.user for m in trip.members.filter(role__in=["owner", "admin"]).select_related("user")]
        notify_many(
            organisers,
            "trip_joined",
            f"{request.user.display_name or request.user.username} joined {trip.title}",
            actor=request.user,
            body="They used your invite code.",
            trip=trip,
        )
    return Response(TripDetailSerializer(trip, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def home_feed(request):
    """Everything the Home screen shows, in one round trip."""
    user = request.user
    mine = trips_for(user).select_related("created_by")
    today = date.today()

    live = mine.filter(status="active").first()
    if not live:
        live = mine.filter(start_date__lte=today, end_date__gte=today).first()
    upcoming = mine.filter(status="planning", end_date__gte=today).order_by("start_date")[:4]
    past = mine.filter(status="completed").order_by("-end_date")[:4]

    context = {"request": request}
    return Response(
        {
            "user": UserSerializer(user).data,
            "live_trip": TripListSerializer(live, context=context).data if live else None,
            "upcoming": TripListSerializer(upcoming, many=True, context=context).data,
            "past": TripListSerializer(past, many=True, context=context).data,
            "counts": {
                "trips": mine.count(),
                "completed": mine.filter(status="completed").count(),
                "places": Activity.objects.filter(completed_by=user)
                .exclude(place_name="")
                .values("place_name")
                .distinct()
                .count(),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def catalog(request):
    return Response({"destinations": DESTINATIONS, "trip_types": TRIP_TYPE_DEFAULTS})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def destination_defaults(request):
    """Smart defaults for step 1 and 4 of the wizard."""
    name = request.query_params.get("destination", "")
    trip_type = request.query_params.get("trip_type", "friends")
    dest = find_destination(name)
    defaults = TRIP_TYPE_DEFAULTS.get(trip_type, TRIP_TYPE_DEFAULTS["friends"]).copy()
    if dest:
        defaults["cover_key"] = dest["cover_key"]
        defaults["region"] = dest["region"]
        defaults["suggested_days"] = dest["ideal_days"]
        defaults["transport"] = dest["transport"]
        defaults["tagline"] = dest["tagline"]
    return Response(defaults)
