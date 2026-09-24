from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import (
    action,
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.authentication import OptionalJWTAuthentication
from accounts.serializers import UserMiniSerializer, UserSerializer
from notifications.services import mark_chat_seen, notify, notify_chat_message, notify_many
from rewards.services import (
    CANCEL_PENALTY,
    CHECKIN_XP,
    DAY_COMPLETE_BONUS,
    EXPERIENCE_XP,
    MEMORY_XP,
    ORGANIZER_COMPLETE_BONUS,
    TRIP_COMPLETE_BONUS,
    TRIP_CREATE_XP,
    award_xp,
    evaluate_achievements,
    leave_penalty,
)

from .catalog import DESTINATIONS, TRIP_TYPE_DEFAULTS, find_destination, plan_for_day
from .geo import distance_from_stop
from .settle import award_or_hold, release_if_settled, suggested_transfers, take_back, upi_link
from .regional_theme import DEFAULT_TRIP_THEME
from .models import (
    Activity,
    ChatMessage,
    ChecklistItem,
    Day,
    Expense,
    Memory,
    Settlement,
    Trip,
    TripExperience,
    TripMember,
)
from .serializers import (
    ActivitySerializer,
    ChatMessageSerializer,
    ChecklistItemSerializer,
    DaySerializer,
    ExpenseSerializer,
    MemorySerializer,
    SettlementSerializer,
    TripCreateSerializer,
    TripDetailSerializer,
    TripExperienceSerializer,
    TripListSerializer,
    TripMemberSerializer,
)


def trips_for(user):
    return Trip.objects.filter(members__user=user).distinct()


def trip_expense_balances(trip) -> list[dict]:
    """Per-member paid/share/balance for a trip's logged expenses — reused
    by the expenses endpoint itself and by the trip-completed notification's
    summary. `user` is the raw model here, not yet serialised, since the two
    callers want different shapes from it (an API response vs. plain text).

    Confirmed settlements count: paying someone back moves your balance up
    by that much, and theirs down — so a settled group shows everyone even."""
    expenses = trip.expenses.select_related("paid_by")
    total = expenses.aggregate(total=Sum("amount"))["total"] or 0
    head_count = max(trip.members.count(), 1)
    share = round(total / head_count)
    confirmed = trip.settlements.filter(status="confirmed")
    balances = []
    for member in trip.members.select_related("user"):
        paid = expenses.filter(paid_by=member.user).aggregate(total=Sum("amount"))["total"] or 0
        sent = confirmed.filter(from_user=member.user).aggregate(total=Sum("amount"))["total"] or 0
        received = confirmed.filter(to_user=member.user).aggregate(total=Sum("amount"))["total"] or 0
        balances.append(
            {"user": member.user, "paid": paid, "share": share, "balance": paid - share + sent - received}
        )
    return balances


def expense_summary_line(trip) -> str:
    """'Rahul gets ₹800 back, Sneha owes ₹800' — or a clean fallback when
    nothing was ever logged. Used in the trip-completed push/notification,
    where a full breakdown doesn't fit."""
    balances = trip_expense_balances(trip)
    if not any(b["paid"] for b in balances):
        return "No expenses were logged for this trip."
    owed_back = [b for b in balances if b["balance"] > 0]
    owes = [b for b in balances if b["balance"] < 0]
    parts = [f"{b['user'].name.split()[0]} gets ₹{b['balance']} back" for b in owed_back]
    parts += [f"{b['user'].name.split()[0]} owes ₹{-b['balance']}" for b in owes]
    return ", ".join(parts) + "." if parts else "Everyone's even — no one owes anything."


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


def require_organiser(trip, user, action="do this"):
    member = require_member(trip, user)
    if member.role not in ("owner", "admin"):
        raise PermissionDenied(f"Only the trip organiser can {action}.")
    return member


def trip_xp_for(trip, user) -> int:
    """Everything `user` has earned on `trip`, from their XP ledger."""
    return user.xp_transactions.filter(trip=trip).aggregate(total=Sum("amount"))["total"] or 0


def award_everyone(trip, amount, reason, kind):
    """Pay the same XP to every member — used for things the group does together."""
    users = [m.user for m in trip.members.select_related("user")]
    for user in users:
        award_xp(user, amount, reason, kind=kind, trip=trip)
    return users


_KEEP = object()


def share_experience_to_feed(experience, soundtrack=_KEEP):
    """A trip write-up is also a Feed post — create it the first time, keep it
    in step on every edit. If the author deleted the post, a new edit shares it
    again. `soundtrack` is left as it was unless a song (or None) is passed."""
    from explore.models import TravelPost

    trip = experience.trip
    fields = {
        "caption": experience.text,
        "place": trip.destination,
        "cover_key": trip.cover_key,
        "image_url": trip.cover_image,
    }
    if soundtrack is not _KEEP:
        fields["soundtrack"] = soundtrack
    if experience.post_id:
        TravelPost.objects.filter(pk=experience.post_id).update(**fields)
        return
    experience.post = TravelPost.objects.create(author=experience.user, trip=trip, **fields)
    experience.save(update_fields=["post"])


def photo_fingerprint(image, image_url: str) -> str:
    """SHA-256 of an uploaded photo's bytes, or of its link when it's a URL.
    Empty when there's no photo at all (a caption-only memory earns nothing)."""
    import hashlib

    if image:
        digest = hashlib.sha256()
        for chunk in image.chunks():
            digest.update(chunk)
        image.seek(0)
        return digest.hexdigest()
    if image_url:
        return hashlib.sha256(f"url:{image_url.strip()}".encode()).hexdigest()
    return ""


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
        # Rewards taking the initiative to plan something, not just finishing it.
        award_xp(self.request.user, TRIP_CREATE_XP, f"Planned {trip.title}", kind="trip", trip=trip)
        self._created_trip = trip

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        trip = self._created_trip
        detail = TripDetailSerializer(trip, context=self.get_serializer_context())
        payload = dict(detail.data)
        payload["xp_awarded"] = TRIP_CREATE_XP
        return Response(payload, status=status.HTTP_201_CREATED)

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

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def leave(self, request, pk=None):
        """Step off a trip you joined. Costs a little XP (see leave_penalty);
        what you already earned on the trip stays yours. The owner can't
        leave — they cancel or delete the trip instead."""
        trip = self.get_object()
        member = require_member(trip, request.user)
        if member.role == "owner":
            raise ValidationError(
                {"detail": "You organise this trip, so you can't leave it — cancel or delete it instead."}
            )
        if trip.status == "completed":
            raise ValidationError({"detail": "This trip is finished — it stays in your history."})

        penalty = leave_penalty(trip)
        member.delete()
        # Stops they were looking after go back to "anyone on the trip".
        Activity.objects.filter(day__trip=trip, assigned_to=request.user).update(assigned_to=None)
        award_xp(request.user, penalty, f"Left {trip.title}", kind="bonus", trip=trip)

        organisers = [m.user for m in trip.members.filter(role__in=["owner", "admin"]).select_related("user")]
        notify_many(
            organisers,
            "trip_left",
            f"{request.user.name} left {trip.title}",
            actor=request.user,
            body="They're no longer on the trip. Stops they were looking after are open again.",
            trip=trip,
        )
        request.user.refresh_from_db()
        return Response(xp_result(request.user, {"xp_penalty": penalty}))

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

        my_xp = trip_xp_for(trip, request.user)

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
                "experiences": TripExperienceSerializer(
                    trip.experiences.filter(skipped=False).select_related("user"), many=True
                ).data,
            }
        )

    @action(detail=True, methods=["get", "post"])
    def experience(self, request, pk=None):
        """Your own write-up of a finished trip. Posting again edits it; only
        the first real write-up earns XP (a skip doesn't count as one)."""
        trip = self.get_object()
        require_member(trip, request.user)
        mine = trip.experiences.filter(user=request.user).first()
        if request.method == "GET":
            return Response(TripExperienceSerializer(mine).data if mine and not mine.skipped else None)
        if trip.status != "completed":
            raise ValidationError({"detail": "You can write about a trip once it's finished."})
        first = mine is None or mine.skipped
        serializer = TripExperienceSerializer(mine, data=request.data)
        serializer.is_valid(raise_exception=True)
        # An optional song for the story; checked against Apple before anything is saved.
        song = _KEEP
        if "song_id" in request.data:
            from explore.serializers import soundtrack_for

            song = soundtrack_for(str(request.data.get("song_id") or ""))
        experience = serializer.save(trip=trip, user=request.user, skipped=False)
        share_experience_to_feed(experience, soundtrack=song)
        awarded = 0
        if first:
            awarded = EXPERIENCE_XP
            award_xp(request.user, awarded, f"Wrote about {trip.title}", kind="bonus", trip=trip)
            request.user.refresh_from_db()
        return Response(
            {**serializer.data, **xp_result(request.user, {"xp_awarded": awarded})},
            status=status.HTTP_201_CREATED if first else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="experience/skip")
    def skip_experience(self, request, pk=None):
        """"Not now" on the Home prompt — don't ask about this trip again."""
        trip = self.get_object()
        require_member(trip, request.user)
        TripExperience.objects.get_or_create(
            trip=trip, user=request.user, defaults={"skipped": True}
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

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
    @transaction.atomic
    def cancel(self, request, pk=None):
        """Call the trip off. Finished trips can't be cancelled. XP anyone
        already earned for real (completed stops, check-ins…) stays theirs —
        but if the trip had already started, the organiser who calls it off
        pays a small XP penalty; cancelling one still in planning is free."""
        trip = self.get_object()
        require_member(trip, request.user, editors_only=True)
        if trip.status == "completed":
            raise ValidationError({"detail": "A finished trip can't be cancelled."})
        was_active = trip.status == "active"
        trip.status = "cancelled"
        trip.save(update_fields=["status"])
        if was_active:
            award_xp(
                request.user,
                CANCEL_PENALTY,
                f"Cancelled {trip.title} after it had started",
                kind="bonus",
                trip=trip,
            )
        others = [m.user for m in trip.members.exclude(user=request.user).select_related("user")]
        notify_many(
            others,
            "trip_cancelled",
            f"{trip.title} was cancelled",
            actor=request.user,
            body=f"{request.user.name} called it off.",
            trip=trip,
        )
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
            release_if_settled(trip)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        expenses = trip.expenses.select_related("paid_by")
        total = expenses.aggregate(total=Sum("amount"))["total"] or 0
        balances = trip_expense_balances(trip)
        return Response(
            {
                "results": ExpenseSerializer(expenses, many=True).data,
                "total": total,
                "per_person_share": balances[0]["share"] if balances else 0,
                "balances": [
                    {**b, "user": UserMiniSerializer(b["user"]).data} for b in balances
                ],
            }
        )

    @action(detail=True, methods=["get", "post"])
    def settle(self, request, pk=None):
        """GET: who should pay whom to square up, with UPI links, plus the
        settlement history. POST: record a payment —
          {to_user_id, amount, method}   the payer says "I've paid" (pending), or
          {from_user_id, amount}         the receiver records cash they got (confirmed)."""
        trip = self.get_object()
        require_member(trip, request.user)
        if request.method == "POST":
            return self._record_settlement(trip, request)

        pending = list(trip.settlements.filter(status="pending").select_related("from_user", "to_user"))
        transfers = []
        for t in suggested_transfers(trip_expense_balances(trip)):
            payer, payee = t["from"], t["to"]
            waiting = next(
                (s for s in pending if s.from_user_id == payer.id and s.to_user_id == payee.id), None
            )
            transfers.append(
                {
                    "from_user": UserMiniSerializer(payer).data,
                    "to_user": UserMiniSerializer(payee).data,
                    "amount": t["amount"],
                    # Only people on this trip ever see a member's UPI ID.
                    "to_upi_id": payee.upi_id,
                    "upi_link": (
                        upi_link(payee.upi_id, payee.name, t["amount"], f"Safar: {trip.title}")
                        if payee.upi_id
                        else ""
                    ),
                    "pending": SettlementSerializer(waiting).data if waiting else None,
                }
            )
        return Response(
            {
                "transfers": transfers,
                "settlements": SettlementSerializer(
                    trip.settlements.select_related("from_user", "to_user")[:50], many=True
                ).data,
                "my_upi_id": request.user.upi_id,
            }
        )

    def _record_settlement(self, trip, request):
        try:
            amount = int(request.data.get("amount", 0))
        except (TypeError, ValueError):
            raise ValidationError({"amount": "Enter an amount in rupees."})
        if not 1 <= amount <= 1_000_000:
            raise ValidationError({"amount": "Enter an amount between ₹1 and ₹10,00,000."})
        method = request.data.get("method", "upi")
        if method not in ("upi", "cash"):
            raise ValidationError({"method": "Pick UPI or cash."})

        members = {m.user_id: m.user for m in trip.members.select_related("user")}

        def member(key):
            try:
                user = members.get(int(request.data.get(key)))
            except (TypeError, ValueError):
                user = None
            if not user or user.id == request.user.id:
                raise ValidationError({key: "Pick someone else on this trip."})
            return user

        if request.data.get("from_user_id") is not None:
            # The receiver records money they got — theirs to vouch for, so it counts now.
            payer = member("from_user_id")
            settlement = Settlement.objects.create(
                trip=trip,
                from_user=payer,
                to_user=request.user,
                amount=amount,
                method=method,
                status="confirmed",
                confirmed_at=timezone.now(),
            )
            notify(
                payer,
                "settle_confirmed",
                f"{request.user.name} marked ₹{amount} from you as received",
                actor=request.user,
                body=f"For {trip.title}. Your balance is updated.",
                trip=trip,
            )
            release_if_settled(trip)
        else:
            payee = member("to_user_id")
            settlement = Settlement.objects.create(
                trip=trip, from_user=request.user, to_user=payee, amount=amount, method=method
            )
            notify(
                payee,
                "settle_paid",
                f"{request.user.name} says they paid you ₹{amount}",
                actor=request.user,
                body=f"For {trip.title} — confirm it once it's in your account.",
                trip=trip,
            )
        return Response(SettlementSerializer(settlement).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path=r"settlements/(?P<settlement_id>[^/.]+)/(?P<decision>confirm|decline)")
    def decide_settlement(self, request, pk=None, settlement_id=None, decision=None):
        """The receiver confirms a payment arrived — or says it didn't."""
        trip = self.get_object()
        require_member(trip, request.user)
        settlement = get_object_or_404(Settlement, pk=settlement_id, trip=trip)
        if settlement.to_user_id != request.user.id:
            raise PermissionDenied("Only the person who was paid can confirm this.")
        if settlement.status != "pending":
            raise ValidationError({"detail": "This payment is already confirmed."})
        if decision == "confirm":
            settlement.status = "confirmed"
            settlement.confirmed_at = timezone.now()
            settlement.save(update_fields=["status", "confirmed_at"])
            notify(
                settlement.from_user,
                "settle_confirmed",
                f"{request.user.name} confirmed your ₹{settlement.amount}",
                actor=request.user,
                body=f"For {trip.title}. You're square on that one.",
                trip=trip,
            )
            release_if_settled(trip)
            return Response(SettlementSerializer(settlement).data)
        notify(
            settlement.from_user,
            "settle_confirmed",
            f"{request.user.name} hasn't received your ₹{settlement.amount}",
            actor=request.user,
            body=f"For {trip.title}. Check the payment went through, then mark it paid again.",
            trip=trip,
        )
        settlement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "post"])
    def checklist(self, request, pk=None):
        """Items with no one assigned are shared by the whole group; the rest
        belong to one person. Members see the shared items and their own;
        organisers see everyone's. POST adds an item:
          assigned_to_id = me (default for members) / anyone (organisers only)
          assigned_to_id = null  → shared with the group
          for_everyone = true    → organisers only: a copy for each person"""
        trip = self.get_object()
        member = require_member(trip, request.user)
        organiser = member.role in ("owner", "admin")

        if request.method == "POST":
            serializer = ChecklistItemSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            if str(request.data.get("for_everyone", "")).lower() in ("1", "true"):
                if not organiser:
                    raise PermissionDenied("Only an organiser can add something for everyone.")
                items = [
                    ChecklistItem.objects.create(
                        trip=trip,
                        title=serializer.validated_data["title"],
                        category=serializer.validated_data.get("category", "packing"),
                        assigned_to=m.user,
                    )
                    for m in trip.members.select_related("user")
                ]
                return Response(
                    ChecklistItemSerializer(items, many=True).data, status=status.HTTP_201_CREATED
                )
            if "assigned_to" in serializer.validated_data:
                assignee = serializer.validated_data["assigned_to"]
            else:
                assignee = request.user  # your own list unless you say otherwise
            if assignee is not None:
                if not trip.members.filter(user=assignee).exists():
                    raise ValidationError({"assigned_to_id": "That person isn't on this trip."})
                if assignee != request.user and not organiser:
                    raise PermissionDenied("Only an organiser can add to someone else's checklist.")
            item = serializer.save(trip=trip, assigned_to=assignee)
            return Response(ChecklistItemSerializer(item).data, status=status.HTTP_201_CREATED)

        items = trip.checklist.select_related("assigned_to")
        if not organiser:
            items = items.filter(Q(assigned_to=None) | Q(assigned_to=request.user))
        return Response(ChecklistItemSerializer(items, many=True).data)

    @action(detail=True, methods=["get", "post"])
    def memories(self, request, pk=None):
        trip = self.get_object()
        require_member(trip, request.user)
        if request.method == "POST":
            serializer = MemorySerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            fingerprint = photo_fingerprint(
                serializer.validated_data.get("image"), serializer.validated_data.get("image_url", "")
            )
            # A photo earns XP once, ever: the same picture uploaded again — by
            # anyone, on any trip — is still added, just without XP.
            original = bool(fingerprint) and not Memory.objects.filter(content_hash=fingerprint).exists()
            serializer.save(trip=trip, user=request.user, content_hash=fingerprint, is_original=original)
            awarded = MEMORY_XP if original else 0
            award_xp(request.user, awarded, "Added a photo", kind="photo", trip=trip)
            unlocked = evaluate_achievements(request.user, trip=trip) if original else []
            request.user.refresh_from_db()
            return Response(
                {
                    **serializer.data,
                    **xp_result(
                        request.user,
                        {
                            "xp_awarded": awarded,
                            # Tells the app why there was no XP this time.
                            "duplicate_photo": bool(fingerprint) and not original,
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
            message = serializer.save(trip=trip, user=request.user)
            # Sending means you're in the chat too.
            mark_chat_seen(trip, request.user)
            notify_chat_message(message)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        # The chat polls while it's open — so this person is reading it right now.
        mark_chat_seen(trip, request.user)
        messages = trip.messages.select_related("user")
        # The chat polls with ?after=<last id it has> to fetch only what's new.
        after = request.query_params.get("after")
        if after:
            try:
                messages = messages.filter(id__gt=int(after))
            except ValueError:
                raise ValidationError({"after": "Must be a message id."})
            return Response(ChatMessageSerializer(messages[:200], many=True).data)
        # First load: the latest 200, oldest first.
        latest = list(messages.order_by("-created_at", "-id")[:200])[::-1]
        return Response(ChatMessageSerializer(latest, many=True).data)


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
        # stop is pinned.
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
        """The organiser marks a stop done for the whole group, and everyone on
        the trip earns its XP. A pinned stop can only be completed from within
        1 km of it — there's no way around that."""
        activity = self.get_object()
        trip = activity.day.trip
        require_organiser(trip, request.user, "mark stops as done")
        if activity.status == "completed":
            return Response(
                xp_result(request.user, {"activity": ActivitySerializer(activity).data})
            )
        # Doing the first stop is what starts a trip, so the one-live-trip rule applies here too.
        if trip.status == "planning":
            ensure_can_go_live(trip, request.user)
        elif trip.status in ("completed", "cancelled"):
            raise ValidationError({"detail": "This trip is " + trip.status + "."})

        distance_km = distance_from_stop(activity, request.data) if has_pin(activity) else None

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
        members = award_everyone(trip, xp, f"Completed {activity.title}", "activity")

        day = activity.day
        day_completed = day.is_complete
        if day_completed:
            award_everyone(trip, DAY_COMPLETE_BONUS, f"Finished day {day.index}", "day")
            xp += DAY_COMPLETE_BONUS

        trip_completed = False
        xp_held = 0
        remaining = Activity.objects.filter(day__trip=trip, status="planned").count()
        if remaining == 0 and trip.status != "completed":
            trip.status = "completed"
            trip.save(update_fields=["status"])
            trip_completed = True
            # Completion XP waits for anyone who still owes money on the trip.
            balances = trip_expense_balances(trip)
            for member in members:
                paid_now = award_or_hold(trip, member, TRIP_COMPLETE_BONUS, f"Completed {trip.title}", balances)
                if member.id == request.user.id:
                    xp += paid_now
                    xp_held += TRIP_COMPLETE_BONUS - paid_now
            paid_now = award_or_hold(
                trip, trip.created_by, ORGANIZER_COMPLETE_BONUS, f"Organised {trip.title} to completion", balances
            )
            if trip.created_by_id == request.user.id:
                xp += paid_now
                xp_held += ORGANIZER_COMPLETE_BONUS - paid_now
            notify_many(
                members,
                "trip_completed",
                f"{trip.title} is complete! 🎉",
                body=expense_summary_line(trip),
                trip=trip,
            )
        elif trip.status == "planning":
            trip.status = "active"
            trip.save(update_fields=["status"])

        unlocked = []
        for member in members:
            badges = evaluate_achievements(member, trip=trip)
            if member.pk == request.user.pk:
                unlocked = badges
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
                    "xp_held": xp_held,
                    "unlocked": [{"title": a.title, "icon": a.icon} for a in unlocked],
                },
            )
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def undo(self, request, pk=None):
        """Marked something done by mistake — take back what everyone earned for it."""
        activity = self.get_object()
        trip = activity.day.trip
        require_organiser(trip, request.user, "undo a stop")
        if activity.status != "completed":
            return Response(xp_result(request.user, {"activity": ActivitySerializer(activity).data}))
        day = activity.day
        day_was_complete = day.is_complete
        trip_was_complete = trip.status == "completed"

        award_everyone(trip, -activity.xp_value, f"Undid {activity.title}", "activity")
        if day_was_complete:
            award_everyone(trip, -DAY_COMPLETE_BONUS, f"Day {day.index} reopened", "day")
        if trip_was_complete:
            for m in trip.members.select_related("user"):
                take_back(trip, m.user, TRIP_COMPLETE_BONUS, f"{trip.title} reopened")
            take_back(trip, trip.created_by, ORGANIZER_COMPLETE_BONUS, f"{trip.title} reopened")

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
        if trip_was_complete:
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

    def _require_owner_or_organiser(self, expense):
        # Balances decide who owes what (and whose XP is held), so only whoever
        # paid, or an organiser, can change or remove an expense.
        member = require_member(expense.trip, self.request.user)
        if expense.paid_by_id != self.request.user.id and member.role not in ("owner", "admin"):
            raise PermissionDenied("Only whoever paid, or an organiser, can change this expense.")

    def perform_update(self, serializer):
        self._require_owner_or_organiser(serializer.instance)
        expense = serializer.save()
        release_if_settled(expense.trip)

    def perform_destroy(self, instance):
        self._require_owner_or_organiser(instance)
        trip = instance.trip
        instance.delete()
        release_if_settled(trip)


class ChecklistItemViewSet(viewsets.ModelViewSet):
    """Ticking, editing and removing single checklist items. Shared items
    (no one assigned) are anyone's to tick; a personal item is its owner's;
    organisers can do anything, including moving an item to someone else."""

    permission_classes = [IsAuthenticated]
    serializer_class = ChecklistItemSerializer

    def get_queryset(self):
        user = self.request.user
        organising = TripMember.objects.filter(user=user, role__in=["owner", "admin"]).values("trip")
        return (
            ChecklistItem.objects.filter(trip__members__user=user)
            .filter(Q(assigned_to=None) | Q(assigned_to=user) | Q(trip__in=organising))
            .select_related("assigned_to")
            .distinct()
        )

    def _is_organiser(self, item) -> bool:
        return item.trip.members.filter(user=self.request.user, role__in=["owner", "admin"]).exists()

    def perform_update(self, serializer):
        item = serializer.instance
        if not self._is_organiser(item):
            if item.assigned_to_id not in (None, self.request.user.id):
                raise PermissionDenied("That's on someone else's checklist.")
            if "assigned_to" in serializer.validated_data and serializer.validated_data["assigned_to"] not in (
                None,
                self.request.user,
            ):
                raise PermissionDenied("Only an organiser can move an item to someone else.")
        assignee = serializer.validated_data.get("assigned_to")
        if assignee is not None and not item.trip.members.filter(user=assignee).exists():
            raise ValidationError({"assigned_to_id": "That person isn't on this trip."})
        serializer.save()

    def perform_destroy(self, instance):
        # Members can remove their own items; shared and others' are for organisers.
        if not self._is_organiser(instance) and instance.assigned_to_id != self.request.user.id:
            raise PermissionDenied("Only an organiser can remove that.")
        instance.delete()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def join_trip(request):
    code = (request.data.get("code") or "").strip().upper()
    trip = Trip.objects.filter(join_code=code).first()
    if not trip:
        raise ValidationError({"code": "That invite code didn't match any trip."})
    already = trip.members.filter(user=request.user).exists()
    if not already and trip.status in ("completed", "cancelled"):
        raise ValidationError({"code": f"This trip is {trip.status}, so it can't be joined any more."})
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


class InvitePreviewThrottle(ScopedRateThrottle):
    """The invite preview is public, so cap how fast anyone can try codes."""

    scope = "invite_preview"


@api_view(["GET"])
@authentication_classes([OptionalJWTAuthentication])
@permission_classes([AllowAny])
@throttle_classes([InvitePreviewThrottle])
def invite_preview(request, code):
    """What someone sees when they open an invite link, before deciding to
    join — signed in or not. Only what an invitation should show: no chat,
    expenses, exact pins or join code."""
    trip = Trip.objects.filter(join_code=code.strip().upper()).select_related("created_by").first()
    if not trip:
        return Response({"detail": "That invite link doesn't match any trip."}, status=status.HTTP_404_NOT_FOUND)

    members = list(trip.members.select_related("user"))
    is_member = request.user.is_authenticated and any(m.user_id == request.user.id for m in members)
    days = [
        {
            "index": day.index,
            "date": day.date,
            "title": day.title,
            "stops": [
                {
                    "title": a.title,
                    "category": a.category,
                    "place_name": a.place_name,
                    "start_time": a.start_time,
                }
                for a in day.activities.all()
            ],
        }
        for day in trip.days.prefetch_related("activities")
    ]
    return Response(
        {
            "code": trip.join_code,
            # Only members need the id, to open the trip.
            "trip_id": str(trip.id) if is_member else None,
            "is_member": is_member,
            "can_join": trip.status in ("planning", "active"),
            "title": trip.title,
            "destination": trip.destination,
            "region": trip.region,
            "summary": trip.summary,
            "cover_key": trip.cover_key,
            "cover_image": trip.cover_image,
            "theme": trip.theme,
            "status": trip.status,
            "start_date": trip.start_date,
            "end_date": trip.end_date,
            "duration_days": trip.duration_days,
            "trip_type": trip.trip_type,
            "pace": trip.pace,
            "transport": trip.transport,
            "budget_per_person": trip.budget_per_person,
            "organiser": UserMiniSerializer(trip.created_by).data,
            "members": [
                {"name": m.user.name, "avatar_emoji": m.user.avatar_emoji, "role": m.role} for m in members
            ],
            "days": days,
        }
    )


def current_trip(mine, today):
    """The trip that's on right now: the live one, or else a planned one whose
    dates cover today. A finished or cancelled trip never counts, even on its
    last day."""
    return (
        mine.filter(status="active").first()
        or mine.filter(status="planning", start_date__lte=today, end_date__gte=today).first()
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def home_feed(request):
    """Everything the Home screen shows, in one round trip."""
    user = request.user
    mine = trips_for(user).select_related("created_by")
    today = date.today()

    live = current_trip(mine, today)
    upcoming = mine.filter(status="planning", end_date__gte=today).order_by("start_date")[:4]
    past = mine.filter(status="completed").order_by("-end_date")[:4]

    # The most recent finished trip this traveller hasn't written about yet.
    to_review = (
        mine.filter(status="completed")
        .exclude(experiences__user=user)
        .order_by("-end_date")
        .first()
    )

    context = {"request": request}
    return Response(
        {
            "user": UserSerializer(user).data,
            "live_trip": TripListSerializer(live, context=context).data if live else None,
            "upcoming": TripListSerializer(upcoming, many=True, context=context).data,
            "past": TripListSerializer(past, many=True, context=context).data,
            "experience_prompt": (
                {
                    "trip": TripListSerializer(to_review, context=context).data,
                    "xp_earned": trip_xp_for(to_review, user),
                }
                if to_review
                else None
            ),
            "counts": {
                "trips": mine.count(),
                "completed": mine.filter(status="completed").count(),
                "places": Activity.objects.filter(
                    day__trip__members__user=user, status="completed"
                )
                .exclude(place_name="")
                .values("place_name")
                .distinct()
                .count(),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def active_theme(request):
    """The colour theme the whole app should currently wear for this
    traveller: their live trip's, or — if nothing's live — their next
    upcoming one's. This is the ambient, site-wide default; a specific trip's
    own pages can still show *that* trip's theme while you're looking at it
    even if it isn't the live/next one (see useTripTheme on the frontend)."""
    mine = trips_for(request.user)
    today = date.today()

    live = current_trip(mine, today)
    if live:
        return Response({"theme": live.theme, "source": "live", "trip_title": live.title})

    upcoming = mine.filter(status="planning", end_date__gte=today).order_by("start_date").first()
    if upcoming:
        return Response({"theme": upcoming.theme, "source": "upcoming", "trip_title": upcoming.title})

    return Response({"theme": DEFAULT_TRIP_THEME, "source": "default", "trip_title": None})


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
