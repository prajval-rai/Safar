"""Who was actually there: stop XP is paid per traveller, by their own check-ins.

Being a member of a trip isn't enough to earn from it — otherwise anyone could
join a friend's trip from home and collect every stop, day and completion
bonus the organiser ticks off. So:

- A stop pays its distance XP only to the people who checked in at it — on the
  spot, within 1 km of a pinned stop. The organiser completing a pinned stop
  from its location checks them in too.
- A stop with no pin can't prove anyone was there, so checking in at one only
  counts for someone who has checked in on the spot at a pinned stop of the
  same trip.
- The day bonus goes to whoever was at every stop of that day.
- The completion bonus is paid by each traveller's own share of the trip's
  stops, and the organiser bonus and planning XP by the organiser's.
- A stop within MIN_TRIP_DISTANCE_KM of where the trip started earns nothing
  — pinning stops round your own house isn't a trip.
- A day's bonus is paid on or after that day's date, and at most one day
  bonus per real day — a 60-day plan can't be ticked off in an afternoon.

Check-ins can land before or after the organiser ticks a stop off, so
`settle_member` works out what someone is owed from scratch and pays only the
difference — it's safe to call again and again.
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from rewards.services import (
    DAY_COMPLETE_BONUS,
    ORGANIZER_COMPLETE_BONUS,
    TRIP_COMPLETE_BONUS,
    TRIP_CREATE_XP,
    as_xp,
    award_xp,
    completion_share,
)

from .geo import MIN_TRIP_DISTANCE_KM, haversine_km
from .models import Activity, DayBonus, StopCheckIn, TripMember

# Checking in is still allowed for this long after the organiser completes a
# stop — someone who arrived a bit behind the group, or was offline, isn't
# locked out of what they earned.
LATE_CHECKIN_WINDOW = timedelta(hours=24)


def can_check_in(activity) -> bool:
    """A stop takes check-ins while it's planned — once the trip is under way
    or its first day has come — and for a while after it's done."""
    trip = activity.day.trip
    if activity.status == "planned":
        if trip.status == "active":
            return True
        return trip.status == "planning" and timezone.localdate() >= trip.start_date
    if activity.status == "completed" and activity.completed_at:
        return (
            activity.day.trip.status != "cancelled"
            and timezone.now() - activity.completed_at <= LATE_CHECKIN_WINDOW
        )
    return False


def near_start(trip, activity) -> bool:
    """A pinned stop within MIN_TRIP_DISTANCE_KM of where the trip started from."""
    start = trip.start_point
    if start is None or activity.latitude is None or activity.longitude is None:
        return False
    return haversine_km(start[0], start[1], activity.latitude, activity.longitude) < MIN_TRIP_DISTANCE_KM


def mark_near_start(trip) -> None:
    """Re-flag every check-in on `trip` once it learns where it starts from."""
    for checkin in StopCheckIn.objects.filter(activity__day__trip=trip).select_related("activity"):
        flag = near_start(trip, checkin.activity)
        if checkin.near_start != flag:
            checkin.near_start = flag
            checkin.save(update_fields=["near_start"])


def attended_ids(trip, user) -> set:
    """Ids of the stops on `trip` that count as `user` having been there."""
    checkins = list(StopCheckIn.objects.filter(user=user, activity__day__trip=trip, near_start=False))
    on_the_spot = any(c.verified for c in checkins)

    return {c.activity_id for c in checkins if c.verified or on_the_spot}


# Stops closer together than this are one place for check-in XP.
SAME_PLACE_M = 200


def checkin_repeats_a_place(checkin) -> bool:
    """Whether `checkin`'s user already checked in within SAME_PLACE_M of this
    stop on the same trip (so its +1 check-in XP was already had)."""
    stop = checkin.activity
    if stop.latitude is None or stop.longitude is None:
        return False
    others = StopCheckIn.objects.filter(
        user=checkin.user,
        activity__day__trip_id=stop.day.trip_id,
        activity__latitude__isnull=False,
    ).exclude(pk=checkin.pk).select_related("activity")
    return any(
        haversine_km(stop.latitude, stop.longitude, o.activity.latitude, o.activity.longitude) * 1000 < SAME_PLACE_M
        for o in others
    )


def day_bonus_due(user, day) -> bool:
    """The calendar side of the day bonus: that day's date has come, and they
    haven't had a day bonus today already (on any trip)."""
    today_start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    if timezone.localdate() < day.date:
        return False
    return not DayBonus.objects.filter(user=user, created_at__gte=today_start).exists()


def was_there(trip, user) -> bool:
    """Checked in at one or more stops of `trip` — what photo, write-up and
    track XP from it need, so nobody earns them for a trip they weren't on."""
    return bool(attended_ids(trip, user))


def attended_share(trip, user, attended=None) -> Decimal:
    """What share of the trip's stops `user` was at: completed stops they
    checked in at, out of every stop on the trip (skipped ones included, as
    the organiser finishing early pays a share of the bonus too)."""
    attended = attended_ids(trip, user) if attended is None else attended
    stops = Activity.objects.filter(day__trip=trip)
    done = stops.filter(status="completed", pk__in=attended).count()
    return completion_share(done, stops.count())


def settle_member(trip, user, balances=None) -> Decimal:
    """Pay `user` everything their check-ins on `trip` have earned and they
    haven't been paid yet. Returns the XP paid now (not counting any held
    until they settle up)."""
    from .settle import award_or_hold

    attended = attended_ids(trip, user)
    paid = Decimal("0")

    # Distance XP for each completed stop they were at.
    for checkin in StopCheckIn.objects.filter(
        user=user, activity__day__trip=trip, activity__status="completed", xp_paid=0
    ).select_related("activity"):
        stop = checkin.activity
        if checkin.activity_id not in attended or not stop.xp_value:
            continue
        reason = (
            f"Travelled {stop.leg_distance_km:.1f} km to {stop.title}"
            if stop.leg_distance_km is not None
            else f"Completed {stop.title}"
        )
        txn = award_xp(user, stop.xp_value, reason, kind="distance", trip=trip)
        if txn:
            checkin.xp_paid = txn.amount
            checkin.save(update_fields=["xp_paid"])
            paid += txn.amount

    # The day bonus for each fully completed day they were at every stop of.
    for day in trip.days.exclude(bonuses__user=user).prefetch_related("activities"):
        stops = list(day.activities.all())
        if not stops or any(s.status != "completed" or s.id not in attended for s in stops):
            continue
        if not day_bonus_due(user, day):
            continue
        txn = award_xp(user, DAY_COMPLETE_BONUS, f"Finished day {day.index}", kind="day", trip=trip)
        if txn:
            DayBonus.objects.create(day=day, user=user, amount=txn.amount)
            paid += txn.amount

    if trip.status != "completed":
        return paid

    # Their share of the completion bonus, topped up if they checked in late.
    if balances is None:
        from .views import trip_expense_balances

        balances = trip_expense_balances(trip)
    share = attended_share(trip, user, attended)
    member = TripMember.objects.filter(trip=trip, user=user).first()
    if member:
        owed = as_xp(TRIP_COMPLETE_BONUS * share) - member.completion_xp
        if owed > 0 and not trip.no_xp:
            paid_now, granted = award_or_hold(trip, user, owed, f"Completed {trip.title}", balances)
            paid += paid_now
            member.completion_xp += granted
            member.save(update_fields=["completion_xp"])

    if user.pk == trip.created_by_id:
        owed = as_xp(ORGANIZER_COMPLETE_BONUS * share) - trip.organizer_bonus
        if owed > 0 and not trip.no_xp:
            paid_now, granted = award_or_hold(
                trip, user, owed, f"Organised {trip.title} to completion", balances
            )
            paid += paid_now
            trip.organizer_bonus += granted
            trip.save(update_fields=["organizer_bonus"])
        paid += pay_planning_xp(trip, user, attended)

    # Finishing a real trip is what earns whoever referred them their XP.
    if not trip.no_xp and StopCheckIn.objects.filter(
        user=user, activity__day__trip=trip, activity__status="completed", distance_m__isnull=False
    ).exists():
        from accounts.referrals import pay_referral_if_due

        pay_referral_if_due(user)
    return paid


def pay_planning_xp(trip, organiser, attended) -> Decimal:
    """TRIP_CREATE_XP for the organiser — earned by taking the trip, not by
    creating it: paid once it's completed and they were at one of its
    completed stops. Once per trip, so undoing and finishing again never pays
    twice."""
    reason = f"Planned {trip.title}"
    been = Activity.objects.filter(day__trip=trip, status="completed", pk__in=attended).exists()
    if not been or organiser.xp_transactions.filter(trip=trip, reason=reason).exists():
        return Decimal("0")
    txn = award_xp(organiser, TRIP_CREATE_XP, reason, kind="trip", trip=trip)
    return txn.amount if txn else Decimal("0")


def take_back_stop(activity) -> None:
    """Undo a stop: take back its distance XP from everyone it was paid to,
    and the day bonus from everyone who had it for that day."""
    trip = activity.day.trip
    for checkin in activity.checkins.filter(xp_paid__gt=0).select_related("user"):
        award_xp(checkin.user, -checkin.xp_paid, f"Undid {activity.title}", kind="distance", trip=trip)
        checkin.xp_paid = 0
        checkin.save(update_fields=["xp_paid"])
    for bonus in activity.day.bonuses.select_related("user"):
        award_xp(bonus.user, -bonus.amount, f"Day {activity.day.index} reopened", kind="day", trip=trip)
        bonus.delete()


def take_back_completion(trip) -> None:
    """Reopening a completed trip: take back everyone's completion XP and the
    organiser bonus — whether it was paid or is still held."""
    from .settle import take_back

    reason = f"{trip.title} reopened"
    for member in trip.members.filter(completion_xp__gt=0).select_related("user"):
        take_back(trip, member.user, member.completion_xp, reason, held_reason=f"Completed {trip.title}")
        member.completion_xp = 0
        member.save(update_fields=["completion_xp"])
    take_back(
        trip, trip.created_by, trip.organizer_bonus, reason,
        held_reason=f"Organised {trip.title} to completion",
    )
    trip.completion_bonus = trip.organizer_bonus = 0
