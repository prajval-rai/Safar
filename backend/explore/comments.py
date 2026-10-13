"""Reddit-style discussion on a track: suggestions and comments about the
whole route, a day of it or one stop; threaded replies; up/down votes.

  GET  /api/explore/tracks/<id>/comments/?sort=top|new&day=<id>&stop=<id>
       The thread (each comment with its replies nested), plus how many
       comments each day and stop has — the itinerary shows those counts.
  POST /api/explore/tracks/<id>/comments/   {text, parent_id?, day_id?, stop_id?}
  PATCH / DELETE /api/explore/comments/<id>/   your own (DELETE: or a staff member)
  POST /api/explore/comments/<id>/vote/     {value: 1 | -1 | 0}

Comments earn no XP — they'd be too easy to farm.
"""

from django.db import transaction
from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.serializers import UserMiniSerializer

from .models import Track, TrackComment, TrackCommentVote, TrackDay, TrackStop

MAX_LENGTH = 2000
# Deeper replies attach here, so a thread never runs off the side of a phone.
MAX_DEPTH = 5


class CommentThrottle(ScopedRateThrottle):
    """Writing comments: plenty for a real conversation, not for spam."""

    scope = "track_comments"

    def allow_request(self, request, view):
        # Only writing is limited; reading the thread never is.
        if request.method == "GET":
            return True
        return super().allow_request(request, view)


def _depth(comment) -> int:
    depth = 0
    while comment.parent_id:
        comment = comment.parent
        depth += 1
    return depth


def _node(comment, my_votes, user) -> dict:
    deleted = comment.is_deleted
    return {
        "id": comment.id,
        "author": None if deleted else UserMiniSerializer(comment.author).data,
        "text": "" if deleted else comment.text,
        "is_deleted": deleted,
        "score": comment.score,
        "my_vote": my_votes.get(comment.id, 0),
        "is_mine": comment.author_id == user.id,
        "created_at": comment.created_at,
        "edited": comment.edited_at is not None,
        "parent_id": comment.parent_id,
        "day": {"id": comment.day_id, "index": comment.day.index} if comment.day_id else None,
        "stop": {"id": comment.stop_id, "title": comment.stop.title} if comment.stop_id else None,
        "replies": [],
    }


def _counts(track) -> dict:
    live = TrackComment.objects.filter(track=track, is_deleted=False)
    return {
        "total": live.count(),
        "general": live.filter(day=None, stop=None).count(),
        "by_day": {str(r["day"]): r["n"] for r in live.exclude(day=None).values("day").annotate(n=Count("id"))},
        "by_stop": {str(r["stop"]): r["n"] for r in live.exclude(stop=None).values("stop").annotate(n=Count("id"))},
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([CommentThrottle])
def track_comments(request, pk):
    track = get_object_or_404(Track, pk=pk, is_published=True)

    if request.method == "POST":
        return _create(request, track)

    comments = list(
        TrackComment.objects.filter(track=track).select_related("author", "day", "stop", "parent")
    )
    my_votes = dict(
        TrackCommentVote.objects.filter(comment__track=track, user=request.user).values_list("comment_id", "value")
    )
    nodes = {c.id: _node(c, my_votes, request.user) for c in comments}

    # Which top-level threads to show: everything, or one day's / one stop's.
    day_id = request.query_params.get("day")
    stop_id = request.query_params.get("stop")
    roots = []
    for c in comments:
        if c.parent_id:
            if c.parent_id in nodes:
                nodes[c.parent_id]["replies"].append(nodes[c.id])
            continue
        if stop_id and str(c.stop_id) != stop_id:
            continue
        if day_id and not stop_id and str(c.day_id) != day_id:
            continue
        roots.append(nodes[c.id])

    newest = request.query_params.get("sort") == "new"

    def order(items):
        if newest:
            items.sort(key=lambda n: n["created_at"], reverse=True)
        else:
            items.sort(key=lambda n: (n["score"], n["created_at"]), reverse=True)
        for item in items:
            order(item["replies"])

    order(roots)
    # A deleted comment with nothing left under it isn't worth showing.
    roots = [r for r in roots if not (r["is_deleted"] and not r["replies"])]
    return Response({"comments": roots, "counts": _counts(track)})


def _create(request, track):
    from notifications.services import notify

    text = str(request.data.get("text") or "").strip()
    if not text:
        raise ValidationError({"text": "Write something first."})
    if len(text) > MAX_LENGTH:
        raise ValidationError({"text": f"Keep it under {MAX_LENGTH} characters."})

    parent = None
    day = stop = None
    if request.data.get("parent_id"):
        parent = TrackComment.objects.filter(pk=request.data["parent_id"], track=track).first()
        if parent is None:
            raise ValidationError({"parent_id": "That comment isn't on this track."})
        if parent.is_deleted:
            raise ValidationError({"parent_id": "That comment was deleted."})
        while _depth(parent) >= MAX_DEPTH:
            parent = parent.parent
        day, stop = parent.day, parent.stop
    else:
        if request.data.get("stop_id"):
            stop = TrackStop.objects.filter(pk=request.data["stop_id"], track_day__track=track).first()
            if stop is None:
                raise ValidationError({"stop_id": "That stop isn't on this track."})
            day = stop.track_day
        elif request.data.get("day_id"):
            day = TrackDay.objects.filter(pk=request.data["day_id"], track=track).first()
            if day is None:
                raise ValidationError({"day_id": "That day isn't on this track."})

    comment = TrackComment.objects.create(track=track, author=request.user, parent=parent, day=day, stop=stop, text=text)

    about = f" on {stop.title}" if stop else f" on day {day.index}" if day else ""
    name = request.user.name
    if parent is not None:
        notify(
            parent.author,
            "comment_reply",
            f"{name} replied to you on {track.title}",
            actor=request.user,
            body=text[:140],
            track=track,
        )
    if parent is None or parent.author_id != track.author_id:
        notify(
            track.author,
            "track_comment",
            f"{name} commented{about} — {track.title}",
            actor=request.user,
            body=text[:140],
            track=track,
        )

    my_votes = {}
    return Response(_node(comment, my_votes, request.user), status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def track_comment(request, comment_id):
    comment = get_object_or_404(TrackComment.objects.select_related("track"), pk=comment_id)
    if request.method == "PATCH":
        if comment.author_id != request.user.id:
            raise PermissionDenied("You can only edit your own comments.")
        if comment.is_deleted:
            raise ValidationError({"detail": "That comment was deleted."})
        text = str(request.data.get("text") or "").strip()
        if not text or len(text) > MAX_LENGTH:
            raise ValidationError({"text": f"Write between 1 and {MAX_LENGTH} characters."})
        comment.text = text
        comment.edited_at = timezone.now()
        comment.save(update_fields=["text", "edited_at"])
        return Response({"id": comment.id, "text": comment.text, "edited": True})

    if comment.author_id != request.user.id and not request.user.is_staff:
        raise PermissionDenied("You can only delete your own comments.")
    if comment.replies.exists():
        # Keep the conversation under it; just blank this one out.
        comment.is_deleted = True
        comment.text = ""
        comment.save(update_fields=["is_deleted", "text"])
    else:
        comment.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def vote_comment(request, comment_id):
    """{"value": 1} upvotes, -1 downvotes, 0 takes your vote back."""
    comment = get_object_or_404(TrackComment.objects.select_for_update(), pk=comment_id)
    if comment.is_deleted:
        raise ValidationError({"detail": "That comment was deleted."})
    if comment.author_id == request.user.id:
        raise ValidationError({"detail": "You can't vote on your own comment."})
    try:
        value = int(request.data.get("value"))
    except (TypeError, ValueError):
        value = None
    if value not in (-1, 0, 1):
        raise ValidationError({"value": "Send 1, -1 or 0."})

    if value == 0:
        TrackCommentVote.objects.filter(comment=comment, user=request.user).delete()
    else:
        TrackCommentVote.objects.update_or_create(comment=comment, user=request.user, defaults={"value": value})
    comment.score = comment.votes.aggregate(s=Sum("value"))["s"] or 0
    comment.save(update_fields=["score"])
    return Response({"id": comment.id, "score": comment.score, "my_vote": value})
