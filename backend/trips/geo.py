"""Location checks for completing stops.

The distance rule is enforced on the server, but the coordinates come from the
traveller's own phone. A determined person can spoof browser GPS, so on top of
the 1 km rule every reading is checked against the traveller's last one
(`check_plausible`): teleporting between cities is refused. That stops honest
mistakes, casual shortcuts and fast farming — it is not tamper-proof anti-cheat,
which is why the daily XP cap (rewards.services.DAILY_XP_CAP) backs it up.
"""

import math
from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone

from rest_framework.exceptions import ValidationError

# A traveller must be within this distance of a stop to complete or check in.
COMPLETE_RADIUS_KM = 1.0
# A fix worse than this is too vague to trust either way.
MAX_ACCURACY_M = 1000.0
# A new trip's destination has to be at least this far from where the planner
# is — a trip round the corner isn't a trip (and would be an easy XP farm).
MIN_TRIP_DISTANCE_KM = 10.0
# Faster than this between two readings is impossible — even by plane.
MAX_TRAVEL_SPEED_KMH = 900.0
# Jumps shorter than this are never questioned: GPS drift, a quick taxi.
PLAUSIBLE_ALWAYS_KM = 30.0
# An offline reading can be sent this long after it was taken, at most.
MAX_READING_AGE = timedelta(hours=24)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rad = math.radians
    a = (
        math.sin(rad(lat2 - lat1) / 2) ** 2
        + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(rad(lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def _number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def optional_point(data):
    """(lat, lng) from a request body when it carries a usable location, else None."""
    lat, lng = _number(data.get("latitude")), _number(data.get("longitude"))
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return (lat, lng)


def too_close_for_xp(dest_lat, dest_lng, point) -> bool:
    """True when `point` (lat, lng) — where the trip was planned or started
    from — is within MIN_TRIP_DISTANCE_KM of the destination. Such a trip is
    allowed but earns no XP (Trip.no_xp). Nothing to measure → False."""
    if dest_lat is None or dest_lng is None or point is None:
        return False
    return haversine_km(point[0], point[1], float(dest_lat), float(dest_lng)) < MIN_TRIP_DISTANCE_KM


def distance_from_stop(activity, data) -> float:
    """Kilometres between the traveller and the stop, or a friendly 400.

    Raises ValidationError when the location is missing, too vague, or more than
    COMPLETE_RADIUS_KM away.
    """
    name = activity.place_name or activity.title
    lat, lng = _number(data.get("latitude")), _number(data.get("longitude"))
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValidationError(
            {"detail": f"Turn on location so we can confirm you're at {name}."}
        )

    accuracy = _number(data.get("accuracy"))
    if accuracy is None:
        raise ValidationError(
            {"detail": "We couldn't tell how accurate your location is. Try again with location on."}
        )
    if accuracy > MAX_ACCURACY_M:
        raise ValidationError(
            {"detail": "Your location signal isn't accurate enough yet. Step outside and try again."}
        )

    distance = haversine_km(lat, lng, activity.latitude, activity.longitude)
    if distance > COMPLETE_RADIUS_KM:
        shown = f"{distance * 1000:.0f} m" if distance < 1 else f"{distance:.1f} km"
        raise ValidationError(
            {
                "detail": (
                    f"You're {shown} from {name}. "
                    f"Get within {COMPLETE_RADIUS_KM:.0f} km to do this."
                )
            }
        )
    return distance


def reading_time(data):
    """When the phone took this reading: `captured_at` (ms since epoch) for a
    check-in saved offline and sent later, otherwise now. Never in the
    future, and never older than MAX_READING_AGE."""
    now = timezone.now()
    ms = _number(data.get("captured_at"))
    if ms is None:
        return now
    try:
        at = datetime.fromtimestamp(ms / 1000, tz=dt_timezone.utc)
    except (OverflowError, OSError, ValueError):
        return now
    return min(now, max(at, now - MAX_READING_AGE))


def check_plausible(user, point, at, source: str):
    """Refuse a reading `user` couldn't physically be at, given their last one
    — then remember it for next time. `point` is (lat, lng)."""
    from .models import LocationFix

    last = LocationFix.objects.filter(user=user, at__lte=at).order_by("-at").first()
    if last:
        km = haversine_km(last.latitude, last.longitude, point[0], point[1])
        hours = max((at - last.at).total_seconds() / 3600, 1 / 60)
        if km > PLAUSIBLE_ALWAYS_KM and km / hours > MAX_TRAVEL_SPEED_KMH:
            ago = at - last.at
            minutes = int(ago.total_seconds() // 60)
            when = f"{minutes} min" if minutes < 120 else f"{minutes // 60} h"
            raise ValidationError(
                {
                    "detail": (
                        f"That's {km:.0f} km from where you were {when} ago — faster than anyone "
                        "can travel. If your location is wrong, try again in a moment."
                    )
                }
            )
    LocationFix.objects.create(user=user, latitude=point[0], longitude=point[1], at=at, source=source)
