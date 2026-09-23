"""Sends real push notifications to the mobile app via Expo's push service —
separate from notifications.push, which is Web Push for the website and only
that. Needs no API key for basic sending; Expo's endpoint is keyless by
default.

Requires the mobile app to actually be a real build, not Expo Go — Expo
dropped remote push support from Expo Go on Android in SDK 53 — but nothing
here needs to know that. It just posts to Expo's API and lets a token Expo
reports as dead get cleaned up, the same way push.py does for stale Web
Push subscriptions.
"""

import logging

import requests

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
# Expo accepts at most 100 messages per request.
BATCH_SIZE = 100


def push_to_expo_tokens(tokens: list[str], title: str, body: str, *, url: str = "/") -> None:
    """Best-effort, same spirit as push_to_user in push.py: a whole batch
    failing (network blip, Expo's service down) is logged and skipped rather
    than raised — a push notification is never worth breaking the action
    that triggered it. A token Expo says is dead (uninstalled, or otherwise
    permanently unregistered) is deleted so it's never tried again."""
    if not tokens:
        return

    for start in range(0, len(tokens), BATCH_SIZE):
        batch = tokens[start : start + BATCH_SIZE]
        messages = [
            {"to": token, "title": title, "body": body, "data": {"url": url}, "sound": "default"}
            for token in batch
        ]
        try:
            response = requests.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                timeout=10,
            )
            response.raise_for_status()
            results = response.json().get("data", [])
        except Exception:
            # Anything at all — a real network failure, a bad response body,
            # a bug in this code — logs and moves on. A push notification is
            # never worth breaking the action that triggered it.
            logger.exception("Expo push batch failed (%d token(s))", len(batch))
            continue

        _drop_dead_tokens(batch, results)


def _drop_dead_tokens(tokens: list[str], results: list[dict]) -> None:
    # Imported here, not at module load, so this file has no hard dependency
    # on Django's app registry being ready at import time.
    from .models import ExpoPushToken

    dead = [
        token
        for token, result in zip(tokens, results)
        if result.get("status") == "error"
        and result.get("details", {}).get("error") == "DeviceNotRegistered"
    ]
    if dead:
        ExpoPushToken.objects.filter(token__in=dead).delete()
