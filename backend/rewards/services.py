"""XP and achievement rules live here so every endpoint awards points the same way."""

from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import models, transaction

from trips.geo import MIN_TRIP_DISTANCE_KM

from .models import Achievement, UserAchievement, XPTransaction

# XP is deliberately scarce: every single reward is at most 10 XP (MAX_REWARD),
# and distance XP comes in fractions, so a high level actually says something
# about how much you travel.
MAX_REWARD = 10
DAY_COMPLETE_BONUS = 5
TRIP_COMPLETE_BONUS = 10
CHECKIN_XP = 1
MEMORY_XP = 1
EXPERIENCE_XP = 10
TRACK_PUBLISH_XP = 10
TRIP_CREATE_XP = 2
# Referring a friend: paid to the referrer once someone who signed up with their
# link finishes their first real trip — at most MAX_REFERRALS_PER_MONTH (see accounts.referrals).
REFERRAL_XP = 10
MAX_REFERRALS_PER_MONTH = 5
# The organiser earns this on top of TRIP_COMPLETE_BONUS once their trip is
# fully done — a reward for the initiative of planning it and for being the
# one who ticks every stop off for the group.
ORGANIZER_COMPLETE_BONUS = 10
# Cancelling a trip that's already under way (people are on it, stops are
# being completed) costs the organiser XP. Cancelling one still in planning
# is free — changing your mind before anyone's set off isn't a penalty.
CANCEL_PENALTY = -10
# The most XP anyone can earn in one day (local time), whatever they do. A
# long, full travel day comes to well under this; it's the backstop against
# anything that slips past the other rules. Achievements, referrals and
# admin-approved past trips don't count towards it.
DAILY_XP_CAP = int(getattr(settings, "DAILY_XP_CAP", 120))
# Photo XP per traveller per trip — a hundred shots of one beach aren't a
# hundred times the trip.
MAX_PHOTO_XP_PER_TRIP = 20
# A traveller who leaves a trip they joined: a small cost, a bit more once the
# trip is under way and the group is counting on them. Leaving a cancelled
# trip is free — there's nothing left to let anyone down on.
LEAVE_PENALTY_PLANNING = -2
LEAVE_PENALTY_LIVE = -3


def leave_penalty(trip) -> int:
    if trip.status == "active":
        return LEAVE_PENALTY_LIVE
    if trip.status == "planning":
        return LEAVE_PENALTY_PLANNING
    return 0

# --- Distance XP --------------------------------------------------------------
# A stop is worth the distance travelled to reach it: from the trip's start
# point to the first stop, then from each stop to the next. XP is kept to two
# decimal places, and it's small on purpose — at the default 0.01 XP per km,
# 1000 km is 10 XP and 2 km is 0.02 XP. One leg can never pay more than
# DISTANCE_XP_LEG_CAP, so a flight across the country isn't a jackpot.
TWO_PLACES = Decimal("0.01")
DISTANCE_XP_PER_KM = Decimal(str(getattr(settings, "DISTANCE_XP_PER_KM", "0.01")))
DISTANCE_XP_LEG_CAP = Decimal(str(getattr(settings, "DISTANCE_XP_LEG_CAP", "10")))


def as_xp(value) -> Decimal:
    """Any number as an XP amount: a Decimal rounded to two places."""
    return Decimal(str(value or 0)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def format_xp(value) -> str:
    """10.00 → "10", 0.50 → "0.5", 2.25 → "2.25" — for messages people read."""
    text = f"{as_xp(value):,f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def distance_xp(km) -> Decimal:
    """XP for travelling `km` kilometres in one leg."""
    if not km or km <= 0:
        return Decimal("0.00")
    return min(DISTANCE_XP_LEG_CAP, as_xp(Decimal(str(km)) * DISTANCE_XP_PER_KM))


def route_xp(points) -> Decimal:
    """Distance XP for a route through (lat, lng) points, leg by leg."""
    from trips.geo import haversine_km

    total = Decimal("0.00")
    for (lat1, lng1), (lat2, lng2) in zip(points, points[1:]):
        total += distance_xp(haversine_km(lat1, lng1, lat2, lng2))
    return total


def completion_share(done: int, total: int) -> Decimal:
    """What fraction of a trip was actually done — a trip the organiser
    finishes early pays that share of the completion bonuses."""
    if not total:
        return Decimal("1")
    return Decimal(done) / Decimal(total)


# The rulebook behind every number above — powers the "How XP works" info tag
# on the Rewards screen, so there's exactly one place these numbers are written
# down. `kind` groups them there: "earn" (ways to get XP), "note" (how it
# works) and "cut" (ways to lose it, which the screen highlights).
XP_RULES = [
    {
        "kind": "earn",
        "icon": "🧭",
        "title": "Plan a trip",
        "detail": (
            f"+{TRIP_CREATE_XP} XP for the organiser once the trip is marked complete and they were "
            "at one of its stops. Creating a trip on its own earns nothing."
        ),
    },
    {
        "kind": "earn",
        "icon": "📍",
        "title": "Travel the distance",
        "detail": (
            f"{format_xp(DISTANCE_XP_PER_KM)} XP per km for everyone who checked in at the stop, counted leg by leg: "
            "from where the trip was started to the first stop, then from each stop to the next. "
            f"1000 km is {format_xp(distance_xp(1000))} XP, 2 km is {format_xp(distance_xp(2))} XP; "
            f"one leg pays at most {format_xp(DISTANCE_XP_LEG_CAP)} XP."
        ),
    },
    {
        "kind": "earn",
        "icon": "🗺️",
        "title": "Check in at a place",
        "detail": (
            f"+{CHECKIN_XP} XP for confirming you've actually arrived somewhere — within 1 km of a "
            "pinned stop. Each person on the trip checks in for themselves."
        ),
    },
    {
        "kind": "earn",
        "icon": "🌅",
        "title": "Finish a full day",
        "detail": (
            f"+{DAY_COMPLETE_BONUS} XP once every stop planned for that day is done — for everyone "
            "who checked in at all of them."
        ),
    },
    {
        "kind": "earn",
        "icon": "📸",
        "title": "Add a photo",
        "detail": (
            f"+{MEMORY_XP} XP for each new photo you upload from a trip you've checked in on, up to "
            f"{MAX_PHOTO_XP_PER_TRIP} XP per trip. The same picture again — even resized, re-saved or "
            "edited — earns nothing, and neither does a link to a photo."
        ),
    },
    {
        "kind": "earn",
        "icon": "🏁",
        "title": "Complete the whole trip",
        "detail": (
            f"Up to +{TRIP_COMPLETE_BONUS} XP once its last stop is done — each person gets the "
            "share that matches the share of the trip's stops they checked in at. The organiser "
            "can also finish a trip early once one stop is done; stops that were skipped count "
            "as ones nobody was at."
        ),
    },
    {
        "kind": "earn",
        "icon": "🤝",
        "title": "Refer a friend",
        "detail": (
            f"+{REFERRAL_XP} XP once someone who joined Safar with your referral link finishes "
            f"their first real trip (checked in on the spot). Up to {MAX_REFERRALS_PER_MONTH} a month. "
            "Find your link on the Rewards screen."
        ),
    },
    {
        "kind": "earn",
        "icon": "👑",
        "title": "Organise it to the end",
        "detail": (
            f"Up to +{ORGANIZER_COMPLETE_BONUS} XP extra for the trip's organiser once the whole trip "
            "is completed — by the share of its stops they were at."
        ),
    },
    {
        "kind": "earn",
        "icon": "📝",
        "title": "Write about the trip",
        "detail": (
            f"+{EXPERIENCE_XP} XP for sharing your experience once a trip you checked in on is finished."
        ),
    },
    {
        "kind": "earn",
        "icon": "✍️",
        "title": "Publish a track",
        "detail": (
            f"+{TRACK_PUBLISH_XP} XP for turning a finished trip you checked in on into a track "
            "others can follow."
        ),
    },
    {
        "kind": "earn",
        "icon": "🏆",
        "title": "Unlock achievements",
        "detail": (
            f"A one-time bonus of up to {MAX_REWARD} XP for each achievement you unlock — "
            "see the Achievements tab for what's left."
        ),
    },
    {
        "kind": "note",
        "icon": "📍",
        "title": "You earn what you were there for",
        "detail": (
            "Being on a trip isn't enough — tap Check in at each stop when you get there (within "
            "1 km of it), once the trip is under way or its first day has come, and up to 24 hours "
            "after the organiser ticks it off. Stops within 200 m of one you've checked in at pay "
            "the check-in XP once. Stop, day and "
            "completion XP only go to the people who checked in, so nobody earns a trip they "
            "followed from home. A stop with no pin needs no location, but only counts once "
            "you've checked in on the spot somewhere on the trip."
        ),
    },
    {
        "kind": "note",
        "icon": "🏡",
        "title": "Where your trip starts matters",
        "detail": (
            "Share your location when you plan a trip — that's where it starts from, and the first "
            "leg of distance XP runs from there. A trip we don't know the start of earns nothing "
            f"until you share it, and stops within {MIN_TRIP_DISTANCE_KM:.0f} km of where it started "
            "don't earn XP."
        ),
    },
    {
        "kind": "note",
        "icon": "📅",
        "title": "One day at a time",
        "detail": (
            "A day's bonus is paid on or after that day's date, and at most one day bonus per real "
            f"day. And nobody earns more than {DAILY_XP_CAP} XP in a day — achievements, referrals "
            "and approved past trips aside."
        ),
    },
    {
        "kind": "note",
        "icon": "🔒",
        "title": "Settle up to unlock",
        "detail": (
            "If you still owe money on a trip when it finishes, its completion XP (and the "
            "organiser bonus) is held — you'll get it the moment you've paid back what you owe "
            "and it's confirmed. Stop and day XP isn't affected."
        ),
    },
    {
        "kind": "note",
        "icon": "🎁",
        "title": "Claiming rewards is free",
        "detail": (
            "Claiming a reward never spends your XP — you just need enough total XP to qualify."
        ),
    },
    {
        "kind": "note",
        "icon": "📈",
        "title": "Levels get harder",
        "detail": (
            "Each level costs more than the last: level 2 needs 50 XP, level 3 another 150, "
            "level 4 another 300, and so on."
        ),
    },
    {
        "kind": "cut",
        "icon": "🚪",
        "title": "Leave a trip you joined",
        "detail": (
            f"{LEAVE_PENALTY_PLANNING} XP if you leave before it starts, {LEAVE_PENALTY_LIVE} XP once it's "
            "live. XP you already earned on the trip is kept."
        ),
    },
    {
        "kind": "cut",
        "icon": "⚠️",
        "title": "Cancel a trip you've already started",
        "detail": (
            f"{CANCEL_PENALTY} XP for the organiser if a trip that's already active gets "
            "cancelled. Cancelling one that's still in planning costs nothing."
        ),
    },
    {
        "kind": "cut",
        "icon": "↩️",
        "title": "Undo a stop",
        "detail": (
            "If the organiser undoes a stop that was marked done by mistake, everyone on the trip "
            f"who earned from it loses the distance XP it paid — plus the +{DAY_COMPLETE_BONUS} day "
            "bonus if its day was complete, and the completion and organiser bonuses if the trip "
            "was finished. Check-ins stay, so it all comes back when the stop is done again."
        ),
    },
    {
        "kind": "cut",
        "icon": "🏠",
        "title": "Trips close to home earn nothing",
        "detail": (
            f"A trip to somewhere within {MIN_TRIP_DISTANCE_KM:.0f} km of where you planned or started "
            "it can still be planned and run, but nothing on it earns XP — no stop, day, photo, "
            "check-in or completion XP — and it doesn't count towards achievements."
        ),
    },
    {
        "kind": "cut",
        "icon": "🛟",
        "title": "Never below zero",
        "detail": (
            "Your XP total never shows below 0 — but a cut bigger than what you have isn't "
            "forgotten: the rest comes off the next XP you earn."
        ),
    },
]


def earns_no_xp(trip) -> bool:
    """A trip within MIN_TRIP_DISTANCE_KM of where it was planned from (see
    Trip.no_xp): nothing on it earns XP, and nothing on it costs XP either."""
    return trip is not None and getattr(trip, "no_xp", False)


def _today_start():
    from django.utils import timezone

    now = timezone.localtime()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def cap_room(user) -> Decimal:
    """How much more XP `user` can earn today before hitting DAILY_XP_CAP.
    XP held back until they settle up counts on the day it was held."""
    from .models import HeldXP

    since = _today_start()
    earned = (
        XPTransaction.objects.filter(user=user, counts_to_cap=True, amount__gt=0, created_at__gte=since)
        .aggregate(t=models.Sum("amount"))["t"]
        or 0
    )
    held = HeldXP.objects.filter(user=user, created_at__gte=since).aggregate(t=models.Sum("amount"))["t"] or 0
    return max(Decimal("0"), as_xp(DAILY_XP_CAP) - as_xp(earned) - as_xp(held))


@transaction.atomic
def award_xp(
    user, amount, reason: str, kind: str = "activity", trip=None, *, achievement=False, capped=True
):
    """Record an XP transaction and keep the denormalised user total in sync.
    Returns the transaction — whose amount can be less than asked for, when
    the daily cap cut it short — or None when nothing was paid.

    - Does nothing for a no-XP trip — except an achievement unlocked while on
      one, since achievements are measured without no-XP trips anyway.
    - Earnings count towards DAILY_XP_CAP unless `capped=False` (achievements
      never do); whatever's over the cap isn't paid.
    - A loss bigger than the user's total takes them to 0 and the rest becomes
      debt (User.xp_debt), which comes off what they earn next."""
    amount = as_xp(amount)
    if not amount or (earns_no_xp(trip) and not achievement):
        return None
    capped = capped and not achievement
    if amount > 0 and capped:
        amount = min(amount, cap_room(user))
        if not amount:
            return None
    txn = XPTransaction.objects.create(
        user=user, trip=trip, amount=amount, kind=kind, reason=reason, counts_to_cap=capped
    )
    # Work from the stored numbers, not whatever copy of the user the caller holds.
    fresh = type(user).objects.select_for_update().only("xp", "xp_debt").get(pk=user.pk)
    xp, debt = fresh.xp, fresh.xp_debt
    if amount > 0:
        repay = min(debt, amount)
        debt -= repay
        xp += amount - repay
    else:
        xp += amount
        if xp < 0:
            debt += -xp
            xp = Decimal("0")
    type(user).objects.filter(pk=user.pk).update(xp=xp, xp_debt=debt)
    user.xp, user.xp_debt = xp, debt
    return txn


def hold_xp(user, amount, reason: str, kind: str = "trip", trip=None):
    """Keep XP back instead of paying it (see HeldXP). The daily cap applies
    when it's held, not when it's released."""
    from .models import HeldXP

    amount = min(as_xp(amount), cap_room(user))
    if amount <= 0 or earns_no_xp(trip):
        return None
    return HeldXP.objects.create(user=user, trip=trip, amount=amount, kind=kind, reason=reason)


@transaction.atomic
def release_held_xp(user, trip):
    """Pay out everything held for `user` on `trip`. Returns the XP released."""
    from django.utils import timezone

    from .models import HeldXP

    total = 0
    for held in HeldXP.objects.select_for_update().filter(user=user, trip=trip, released_at=None):
        award_xp(user, held.amount, held.reason, kind=held.kind, trip=trip, capped=False)
        held.released_at = timezone.now()
        held.save(update_fields=["released_at"])
        total += held.amount
    return total


def held_xp_total(user, trip):
    from .models import HeldXP

    return (
        HeldXP.objects.filter(user=user, trip=trip, released_at=None).aggregate(t=models.Sum("amount"))["t"]
        or 0
    )


def _stats(user) -> dict:
    """Every number an achievement can be measured against."""
    from accounts.models import Follow
    from django.db.models import Q
    from trips.models import Activity, Memory, Trip

    # Only what the user was actually there for counts — being a member of a
    # trip isn't enough (see trips.attendance). A trip they were on is one
    # where they checked in on the spot at a pinned stop; a stop they did is a
    # completed stop they checked in at, on such a trip. No-XP trips (too
    # close to home) don't count towards anything either — otherwise
    # achievements would be a back door to the XP they don't pay.
    on_trips = Trip.objects.filter(
        no_xp=False,
        days__activities__checkins__user=user,
        days__activities__checkins__distance_m__isnull=False,
        days__activities__checkins__near_start=False,
    ).distinct()
    finished = on_trips.filter(status="completed")
    done = Activity.objects.filter(
        status="completed", checkins__user=user, checkins__near_start=False, day__trip__in=on_trips
    ).distinct()
    return {
        "trips_completed": finished.count(),
        "activities_completed": done.count(),
        # Only first-time photos count — re-uploading one picture doesn't add up.
        "photos_uploaded": Memory.objects.filter(user=user, is_original=True, trip__in=on_trips)
        .exclude(trip__is_past=True)
        .count(),
        "places_visited": done.exclude(place_name="")
        .values("place_name")
        .distinct()
        .count(),
        "xp_total": user.xp,
        "tracks_published": user.tracks.filter(is_published=True, source_trip__in=on_trips).count(),
        # A past trip only counts once an admin has approved it.
        "states_visited": Trip.objects.filter(
            Q(pk__in=on_trips.values("pk"))
            | Q(is_past=True, review_status="approved", members__user=user, no_xp=False)
        )
        .exclude(region="")
        .values("region")
        .distinct()
        .count(),
        # Stops where the traveller's own phone was really within 1 km.
        "places_verified": done.filter(
            checkins__user=user, checkins__distance_m__isnull=False, checkins__near_start=False
        ).count(),
        # Different destinations covered by finished trips that have a map area.
        "areas_covered": finished.filter(latitude__isnull=False)
        .values("destination")
        .distinct()
        .count(),
        # Only followers who travel for real count — a pile of empty accounts
        # following you doesn't make you a local hero.
        "followers": Follow.objects.filter(
            following=user,
            follower__stop_checkins__distance_m__isnull=False,
            follower__stop_checkins__activity__day__trip__status="completed",
        )
        .values("follower")
        .distinct()
        .count(),
    }


def evaluate_achievements(user, trip=None) -> list[Achievement]:
    """Unlock anything the user now qualifies for. Returns the newly unlocked ones."""
    stats = _stats(user)

    already = set(user.achievements.values_list("achievement__code", flat=True))
    unlocked = []
    for achievement in Achievement.objects.all():
        if achievement.code in already:
            continue
        if stats.get(achievement.goal_kind, 0) >= achievement.goal_value:
            UserAchievement.objects.create(user=user, achievement=achievement, trip=trip)
            award_xp(
                user,
                achievement.xp_reward,
                f"Achievement: {achievement.title}",
                kind="bonus",
                trip=trip,
                achievement=True,
            )
            from notifications.services import notify

            notify(
                user,
                "achievement_unlocked",
                f"Achievement unlocked: {achievement.title}",
                body=f"{achievement.description} (+{achievement.xp_reward} XP)",
                trip=trip,
            )
            unlocked.append(achievement)
    return unlocked


def achievement_progress(user) -> list[dict]:
    """Every achievement with the user's progress towards it — powers the Rewards screen."""
    stats = _stats(user)
    unlocked_at = {
        ua.achievement_id: ua.unlocked_at for ua in user.achievements.select_related("achievement")
    }
    rows = []
    for achievement in Achievement.objects.all():
        current = min(stats.get(achievement.goal_kind, 0), achievement.goal_value)
        rows.append(
            {
                "code": achievement.code,
                "title": achievement.title,
                "description": achievement.description,
                "icon": achievement.icon,
                "xp_reward": achievement.xp_reward,
                "goal_value": achievement.goal_value,
                "current": current,
                "unlocked": achievement.id in unlocked_at,
                "unlocked_at": unlocked_at.get(achievement.id),
            }
        )
    rows.sort(key=lambda r: (not r["unlocked"], -r["current"] / max(r["goal_value"], 1)))
    return rows


DEFAULT_ACHIEVEMENTS = [
    ("first-steps", "First Steps", "Complete your first activity", "👣", 2, "activities_completed", 1),
    ("first-journey", "First Journey", "Complete your first trip", "🎒", 5, "trips_completed", 1),
    ("shutterbug", "Shutterbug", "Upload 10 travel photos", "📸", 5, "photos_uploaded", 10),
    ("explorer", "Explorer", "Visit 5 different places", "🗺️", 5, "places_visited", 5),
    ("pathfinder", "Pathfinder", "Visit 25 different places", "🧭", 10, "places_visited", 25),
    ("storyteller", "Storyteller", "Publish your first track", "✍️", 5, "tracks_published", 1),
    ("weekend-regular", "Weekend Regular", "Complete 3 trips", "🚗", 8, "trips_completed", 3),
    ("state-hopper", "State Hopper", "Travel across 3 regions", "🛤️", 8, "states_visited", 3),
    # Code kept from when this was 5,000 XP so existing unlocks still match.
    ("five-k-club", "500 Club", "Earn 500 XP", "⭐", 10, "xp_total", 500),
    ("busy-boots", "Busy Boots", "Complete 50 activities", "🥾", 10, "activities_completed", 50),
    ("been-there", "Been There", "Complete 5 stops by actually being there", "📍", 5, "places_verified", 5),
    ("area-explorer", "Area Explorer", "Finish trips in 3 different areas", "🗺️", 8, "areas_covered", 3),
    ("local-hero", "Local Hero", "Get 5 followers", "🤝", 5, "followers", 5),
]


def seed_achievements():
    for code, title, description, icon, xp, kind, value in DEFAULT_ACHIEVEMENTS:
        Achievement.objects.update_or_create(
            code=code,
            defaults={
                "title": title,
                "description": description,
                "icon": icon,
                "xp_reward": xp,
                "goal_kind": kind,
                "goal_value": value,
            },
        )
