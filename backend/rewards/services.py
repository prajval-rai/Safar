"""XP and achievement rules live here so every endpoint awards points the same way."""

from django.db import transaction

from .models import Achievement, UserAchievement, XPTransaction

DAY_COMPLETE_BONUS = 100
TRIP_COMPLETE_BONUS = 500
CHECKIN_XP = 10
MEMORY_XP = 15
TRACK_PUBLISH_XP = 150
TRIP_CREATE_XP = 20
# The organiser earns this on top of TRIP_COMPLETE_BONUS once their trip is
# fully done — a reward for the initiative of planning it, not just for
# whoever happened to tap the last stop.
ORGANIZER_COMPLETE_BONUS = 250
# Cancelling a trip that's already under way (people are on it, stops are
# being completed) costs the organiser XP. Cancelling one still in planning
# is free — changing your mind before anyone's set off isn't a penalty.
CANCEL_PENALTY = -75

# The rulebook behind every number above, in the order they'd apply across a
# trip's life — powers the "How XP works" info tag on the Rewards screen, so
# there's exactly one place these numbers are written down.
XP_RULES = [
    {
        "icon": "🧭",
        "title": "Plan a trip",
        "detail": f"+{TRIP_CREATE_XP} XP for starting a new trip as its organiser — initiative counts.",
    },
    {
        "icon": "📍",
        "title": "Complete a stop",
        "detail": "Whatever that activity is worth (usually 10–40 XP) for marking it done.",
    },
    {
        "icon": "🌅",
        "title": "Finish a full day",
        "detail": f"+{DAY_COMPLETE_BONUS} XP bonus once every stop planned for that day is done.",
    },
    {
        "icon": "📸",
        "title": "Add a memory",
        "detail": f"+{MEMORY_XP} XP for uploading a photo from the trip.",
    },
    {
        "icon": "🗺️",
        "title": "Check in at a place",
        "detail": f"+{CHECKIN_XP} XP for confirming you've actually arrived somewhere.",
    },
    {
        "icon": "🏁",
        "title": "Complete the whole trip",
        "detail": f"+{TRIP_COMPLETE_BONUS} XP bonus for whoever completes the trip's very last stop.",
    },
    {
        "icon": "👑",
        "title": "Organise it to the end",
        "detail": (
            f"+{ORGANIZER_COMPLETE_BONUS} XP extra for the trip's organiser once the whole trip "
            "is completed — on top of the usual completion bonus, even if someone else tapped "
            "the last stop."
        ),
    },
    {
        "icon": "✍️",
        "title": "Publish a track",
        "detail": f"+{TRACK_PUBLISH_XP} XP for turning a finished trip into a track others can follow.",
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
def award_xp(user, amount: int, reason: str, kind: str = "activity", trip=None):
    """Record an XP transaction and keep the denormalised user total in sync."""
    if not amount:
        return None
    txn = XPTransaction.objects.create(
        user=user, trip=trip, amount=amount, kind=kind, reason=reason
    )
    user.xp = max(0, user.xp + amount)
    user.save(update_fields=["xp"])
    return txn


def _stats(user) -> dict:
    """Every number an achievement can be measured against."""
    from accounts.models import Follow
    from trips.models import Activity, Memory, Trip

    finished = Trip.objects.filter(members__user=user, status="completed").distinct()
    return {
        "trips_completed": finished.count(),
        "activities_completed": Activity.objects.filter(completed_by=user).count(),
        "photos_uploaded": Memory.objects.filter(user=user).count(),
        "places_visited": Activity.objects.filter(completed_by=user)
        .exclude(place_name="")
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
        "places_verified": Activity.objects.filter(
            completed_by=user, verified_by_location=True
        ).count(),
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
    ("first-steps", "First Steps", "Complete your first activity", "👣", 50, "activities_completed", 1),
    ("first-journey", "First Journey", "Complete your first trip", "🎒", 200, "trips_completed", 1),
    ("shutterbug", "Shutterbug", "Upload 10 travel photos", "📸", 150, "photos_uploaded", 10),
    ("explorer", "Explorer", "Visit 5 different places", "🗺️", 150, "places_visited", 5),
    ("pathfinder", "Pathfinder", "Visit 25 different places", "🧭", 400, "places_visited", 25),
    ("storyteller", "Storyteller", "Publish your first track", "✍️", 200, "tracks_published", 1),
    ("weekend-regular", "Weekend Regular", "Complete 3 trips", "🚗", 350, "trips_completed", 3),
    ("state-hopper", "State Hopper", "Travel across 3 regions", "🛤️", 300, "states_visited", 3),
    ("five-k-club", "5K Club", "Earn 5,000 XP", "⭐", 500, "xp_total", 5000),
    ("busy-boots", "Busy Boots", "Complete 50 activities", "🥾", 400, "activities_completed", 50),
    ("been-there", "Been There", "Complete 5 stops by actually being there", "📍", 200, "places_verified", 5),
    ("area-explorer", "Area Explorer", "Finish trips in 3 different areas", "🗺️", 300, "areas_covered", 3),
    ("local-hero", "Local Hero", "Get 5 followers", "🤝", 200, "followers", 5),
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
