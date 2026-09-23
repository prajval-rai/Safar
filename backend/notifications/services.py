from .expo_push import push_to_expo_tokens
from .models import Notification
from .push import push_to_user


def _open_url(trip=None, track=None) -> str:
    if trip is not None:
        return f"/trips/{trip.id}"
    if track is not None:
        return f"/explore/{track.id}"
    return "/"


def _open_url_mobile(trip=None, track=None) -> str:
    """Same idea as _open_url, but the mobile app's routes aren't identical
    to the website's — a track lives at /tracks/<id> there, not /explore/<id>."""
    if trip is not None:
        return f"/trips/{trip.id}"
    if track is not None:
        return f"/tracks/{track.id}"
    return "/"


def _tag(trip=None, track=None) -> str | None:
    """A burst of pushes about the same trip (or track) replaces the last
    one on the lock screen instead of piling up."""
    if trip is not None:
        return f"trip-{trip.id}"
    if track is not None:
        return f"track-{track.id}"
    return None


def notify(user, kind, title, *, actor=None, body="", trip=None, track=None):
    """Create a notification for `user`, and — on whatever devices they've
    turned it on for, website or mobile app — a real push alongside it.
    Silently does nothing if `actor` is `user` themselves; you don't need
    telling that you joined your own trip or used your own track."""
    if actor is not None and actor.pk == user.pk:
        return None
    note = Notification.objects.create(
        user=user, actor=actor, kind=kind, title=title, body=body, trip=trip, track=track
    )
    push_to_user(user, title, body, url=_open_url(trip=trip, track=track), tag=_tag(trip=trip, track=track))
    push_to_expo_tokens(
        list(user.expo_push_tokens.values_list("token", flat=True)),
        title,
        body,
        url=_open_url_mobile(trip=trip, track=track),
    )
    return note


def notify_many(users, kind, title, *, actor=None, body="", trip=None, track=None):
    for user in users:
        notify(user, kind, title, actor=actor, body=body, trip=trip, track=track)
