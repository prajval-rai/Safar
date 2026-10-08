"""Before a trip: the organiser's own reminder, and checklist nudges.

The organiser picks when the "trip's coming up" reminder goes out (and can add
a note — where to meet, what to bring); without one, everyone gets the default
day-before reminder. Each reminder is followed, for anyone with unticked
checklist items, by a nudge listing them, which opens the trip's checklist.
"""

from django.db.models import Q

from notifications.services import notify

from .models import ChecklistItem


def pending_items(trip, user):
    """`user`'s unticked items on `trip`: the group's shared ones and their own."""
    return ChecklistItem.objects.filter(trip=trip, is_done=False).filter(
        Q(assigned_to=None) | Q(assigned_to=user)
    )


def nudge_checklist(trip, users, *, last_call=False) -> int:
    """Tell each of `users` what's still unticked on the trip's checklist.
    Returns how many were nudged (nobody with an empty list is)."""
    sent = 0
    for user in users:
        items = list(pending_items(trip, user).values_list("title", flat=True)[:50])
        if not items:
            continue
        listed = ", ".join(items[:3]) + (f" and {len(items) - 3} more" if len(items) > 3 else "")
        notify(
            user,
            "checklist_reminder",
            (
                f"Last check before {trip.title}: {len(items)} left on your checklist"
                if last_call
                else f"{len(items)} thing{'s' if len(items) != 1 else ''} left on the checklist for {trip.title}"
            ),
            body=f"Make sure you've sorted: {listed}. Tap to tick them off.",
            trip=trip,
            url=f"/trips/{trip.id}?tab=checklist",
        )
        sent += 1
    return sent
