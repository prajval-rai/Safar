"""Location checks for completing stops.

The distance rule is enforced on the server, but the coordinates come from the
traveller's own phone. A determined person can spoof browser GPS, so this stops
honest mistakes and casual shortcuts — it is not tamper-proof anti-cheat.
"""

import math

from rest_framework.exceptions import ValidationError

# A traveller must be within this distance of a stop to complete or check in.
COMPLETE_RADIUS_KM = 1.0
# A fix worse than this is too vague to trust either way.
MAX_ACCURACY_M = 1000.0


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
    if accuracy is not None and accuracy > MAX_ACCURACY_M:
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
