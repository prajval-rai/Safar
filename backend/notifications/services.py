from .models import Notification


def notify(user, kind, title, *, actor=None, body="", trip=None, track=None):
    """Create a notification for `user`. Silently does nothing if `actor` is
    `user` themselves — you don't need telling that you joined your own trip
    or used your own track."""
    if actor is not None and actor.pk == user.pk:
        return None
    return Notification.objects.create(
        user=user, actor=actor, kind=kind, title=title, body=body, trip=trip, track=track
    )


def notify_many(users, kind, title, *, actor=None, body="", trip=None, track=None):
    for user in users:
        notify(user, kind, title, actor=actor, body=body, trip=trip, track=track)
