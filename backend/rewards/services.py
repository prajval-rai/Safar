"""XP and achievement rules live here so every endpoint awards points the same way."""

from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import models, transaction

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
# The organiser earns this on top of TRIP_COMPLETE_BONUS once their trip is
# fully done — a reward for the initiative of planning it and for being the
# one who ticks every stop off for the group.
ORGANIZER_COMPLETE_BONUS = 10
# Cancelling a trip that's already under way (people are on it, stops are
# being completed) costs the organiser XP. Cancelling one still in planning
# is free — changing your mind before anyone's set off isn't a penalty.
CANCEL_PENALTY = -10
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


# The rulebook behind every number above, in the order they'd apply across a
# trip's life — powers the "How XP works" info tag on the Rewards screen, so
# there's exactly one place these numbers are written down.
XP_RULES = [
    {
        "icon": "🧭",
        "title": "Plan a trip",
        "detail": f"+{TRIP_CREATE_XP} XP for starting a new trip as its organiser.",
    },
    {
        "icon": "📍",
        "title": "Travel the distance",
        "detail": (
            f"{format_xp(DISTANCE_XP_PER_KM)} XP per km for everyone on the trip, counted leg by leg: "
            "from where the trip was started to the first stop, then from each stop to the next. "
            f"1000 km is {format_xp(distance_xp(1000))} XP, 2 km is {format_xp(distance_xp(2))} XP; "
            f"one leg pays at most {format_xp(DISTANCE_XP_LEG_CAP)} XP."
        ),
    },
    {
        "icon": "🌅",
        "title": "Finish a full day",
        "detail": f"+{DAY_COMPLETE_BONUS} XP each once every stop planned for that day is done.",
    },
    {
        "icon": "📸",
        "title": "Add a photo",
        "detail": (
            f"+{MEMORY_XP} XP for each new photo from the trip. A photo only earns XP the first "
            "time it's uploaded — the same picture uploaded again, by you or anyone, earns nothing."
        ),
    },
    {
        "icon": "🗺️",
        "title": "Check in at a place",
        "detail": f"+{CHECKIN_XP} XP for confirming you've actually arrived somewhere.",
    },
    {
        "icon": "🏁",
        "title": "Complete the whole trip",
        "detail": (
            f"+{TRIP_COMPLETE_BONUS} XP for everyone on the trip once its last stop is done. "
            "The organiser can also finish a trip early once one stop is done — then everyone "
            "gets the share of the bonus that matches the share of stops completed."
        ),
    },
    {
        "icon": "👑",
        "title": "Organise it to the end",
        "detail": (
            f"+{ORGANIZER_COMPLETE_BONUS} XP extra for the trip's organiser once the whole trip "
            "is completed."
        ),
    },
    {
        "icon": "🔒",
        "title": "Settle up to unlock",
        "detail": (
            "If you still owe money on a trip when it finishes, its completion XP (and the "
            "organiser bonus) is held — you'll get it the moment you've paid back what you owe "
            "and it's confirmed. Stop and day XP isn't affected."
        ),
    },
    {
        "icon": "📝",
        "title": "Write about the trip",
        "detail": f"+{EXPERIENCE_XP} XP for sharing your experience once a trip is finished.",
    },
    {
        "icon": "✍️",
        "title": "Publish a track",
        "detail": f"+{TRACK_PUBLISH_XP} XP for turning a finished trip into a track others can follow.",
    },
    {
        "icon": "📈",
        "title": "Levels get harder",
        "detail": (
            "Each level costs more than the last: level 2 needs 50 XP, level 3 another 150, "
            "level 4 another 300, and so on."
        ),
    },
    {
        "icon": "🚪",
        "title": "Leave a trip you joined",
        "detail": (
            f"{LEAVE_PENALTY_PLANNING} XP if you leave before it starts, {LEAVE_PENALTY_LIVE} XP once it's "
            "live. XP you already earned on the trip is kept."
        ),
    },
    {
        "icon": "⚠️",
        "title": "Cancel a trip you've already started",
        "detail": (
            f"{CANCEL_PENALTY} XP for the organiser if a trip that's already active gets "
            "cancelled. Cancelling one that's still in planning costs nothing."
        ),
    },
]


@transaction.atomic
def award_xp(user, amount, reason: str, kind: str = "activity", trip=None):
    """Record an XP transaction and keep the denormalised user total in sync."""
    amount = as_xp(amount)
    if not amount:
        return None
    txn = XPTransaction.objects.create(
        user=user, trip=trip, amount=amount, kind=kind, reason=reason
    )
    user.xp = max(0, user.xp + amount)
    user.save(update_fields=["xp"])
    return txn


def hold_xp(user, amount, reason: str, kind: str = "trip", trip=None):
    """Keep XP back instead of paying it (see HeldXP)."""
    from .models import HeldXP

    amount = as_xp(amount)
    if not amount:
        return None
    return HeldXP.objects.create(user=user, trip=trip, amount=amount, kind=kind, reason=reason)


@transaction.atomic
def release_held_xp(user, trip):
    """Pay out everything held for `user` on `trip`. Returns the XP released."""
    from django.utils import timezone

    from .models import HeldXP

    total = 0
    for held in HeldXP.objects.select_for_update().filter(user=user, trip=trip, released_at=None):
        award_xp(user, held.amount, held.reason, kind=held.kind, trip=trip)
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
    from trips.models import Activity, Memory, Trip

    finished = Trip.objects.filter(members__user=user, status="completed").distinct()
    # The organiser completes a stop for the whole group, so a stop counts for
    # everyone on the trip, not just whoever tapped it.
    done = Activity.objects.filter(day__trip__members__user=user, status="completed").distinct()
    return {
        "trips_completed": finished.count(),
        "activities_completed": done.count(),
        # Only first-time photos count — re-uploading one picture doesn't add up.
        "photos_uploaded": Memory.objects.filter(user=user, is_original=True).count(),
        "places_visited": done.exclude(place_name="")
        .values("place_name")
        .distinct()
        .count(),
        "xp_total": user.xp,
        "tracks_published": user.tracks.filter(is_published=True).count(),
        "states_visited": Trip.objects.filter(members__user=user)
        .exclude(region="")
        .values("region")
        .distinct()
        .count(),
        # Stops where the traveller's phone was really within 1 km.
        "places_verified": done.filter(verified_by_location=True).count(),
        # Different destinations covered by finished trips that have a map area.
        "areas_covered": finished.filter(latitude__isnull=False)
        .values("destination")
        .distinct()
        .count(),
        "followers": Follow.objects.filter(following=user).count(),
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
