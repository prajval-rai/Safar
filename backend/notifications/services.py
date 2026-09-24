from datetime import timedelta

from django.utils import timezone

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


# --- Group chat ---------------------------------------------------------------------

# Anyone whose chat polled within this window is reading it right now.
CHAT_VIEWING_WINDOW = timedelta(seconds=20)
# At most one chat push per person per trip in this window.
CHAT_PUSH_COOLDOWN = timedelta(seconds=30)


def notify_chat_message(message) -> None:
    """Tell everyone else on the trip about a new chat message: a push with
    the message itself, and a single bell entry per trip that counts up
    ("3 new messages") instead of one per message. Skips anyone who has the
    chat open, and holds back pushes during a burst."""
    trip, sender = message.trip, message.user
    now = timezone.now()
    text = message.text if len(message.text) <= 140 else f"{message.text[:139]}…"
    sender_first = sender.name.split(" ")[0]

    for member in trip.members.exclude(user=sender).select_related("user"):
        user = member.user
        if member.chat_seen_at and now - member.chat_seen_at < CHAT_VIEWING_WINDOW:
            continue  # it's already on their screen

        note = Notification.objects.filter(user=user, kind="chat_message", trip=trip, read=False).first()
        if note:
            note.count += 1
            note.title = f"{note.count} new messages in {trip.title}"
            note.body = f"{sender_first}: {text}"
            note.actor = sender
            note.created_at = now  # float back to the top of the bell
            note.save(update_fields=["count", "title", "body", "actor", "created_at"])
        else:
            Notification.objects.create(
                user=user,
                actor=sender,
                kind="chat_message",
                title=f"{sender.name} in {trip.title}",
                body=text,
                trip=trip,
            )

        if member.chat_pushed_at and now - member.chat_pushed_at < CHAT_PUSH_COOLDOWN:
            continue
        member.chat_pushed_at = now
        member.save(update_fields=["chat_pushed_at"])
        title = f"{sender.name} · {trip.title}"
        push_to_user(user, title, text, url=f"/trips/{trip.id}?tab=chat", tag=f"chat-{trip.id}")
        push_to_expo_tokens(
            list(user.expo_push_tokens.values_list("token", flat=True)),
            title,
            text,
            url=f"/trips/{trip.id}",
        )


def mark_chat_seen(trip, user) -> None:
    """Called while someone has the chat open: they're reading it, so no
    pushes for now, and the trip's chat entry in their bell is read."""
    now = timezone.now()
    from trips.models import TripMember

    TripMember.objects.filter(trip=trip, user=user).update(chat_seen_at=now)
    Notification.objects.filter(user=user, kind="chat_message", trip=trip, read=False).update(read=True)
