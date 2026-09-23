"""Sends real Web Push notifications — the kind that shows up on a lock
screen and works with the site closed, unrelated to the in-app bell (which
is just a row in the Notification table and always works regardless of any
of this).

Off by default: without VAPID_PRIVATE_KEY/VAPID_PUBLIC_KEY set, push_to_user
is a silent no-op, so a dev environment (or a deploy that hasn't set the
keys yet) never breaks the in-app side of notifications over this.
"""

import json
import logging

from django.conf import settings
from pywebpush import WebPushException, webpush

logger = logging.getLogger(__name__)


def push_enabled() -> bool:
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def _vapid_claims() -> dict:
    return {"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"}


def push_to_user(user, title: str, body: str, *, url: str = "/", tag: str | None = None) -> None:
    """Pushes to every device `user` has subscribed on. Best-effort: a
    subscription the push service no longer recognises (uninstalled,
    permission revoked, browser data cleared…) is quietly deleted rather
    than retried forever; any other failure is logged and skipped, since one
    bad device should never stop the notification reaching the others.

    `tag` groups related pushes so a burst of updates about the same trip
    replaces the last one on the lock screen instead of piling up — pass the
    same tag (e.g. "trip-<id>") for anything about the same trip."""
    if not push_enabled():
        return

    # Imported here, not at module load, so this file has no hard dependency
    # on the trips/rewards apps existing yet at Django startup.
    from .models import PushSubscription

    subscriptions = PushSubscription.objects.filter(user=user)
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims=_vapid_claims(),
            )
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in (404, 410):
                # Gone — the push service is telling us this device will
                # never accept another push. No point keeping it around.
                sub.delete()
            else:
                logger.warning("Web push to %s failed (%s): %s", user, status, exc)
        except Exception:
            logger.exception("Unexpected error sending web push to %s", user)
