"""Verifying Google's "Sign in with Google" ID tokens and turning them into a
Safar account — new or existing. Kept separate from views.py since it's a
handful of non-trivial steps (token verification, account matching, username
generation) that are easier to read and test on their own.
"""

import re

from django.conf import settings
from django.contrib.auth import get_user_model
from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework.exceptions import AuthenticationFailed

User = get_user_model()

# Django's default username validator only allows these characters.
_USERNAME_SAFE = re.compile(r"[^\w.@+-]")


class GoogleSignInNotConfigured(AuthenticationFailed):
    default_detail = "Google sign-in isn't set up on this server yet."


def verify_google_token(credential: str) -> dict:
    """Verifies the ID token's signature, audience and expiry against Google's
    own public keys — this is what actually proves "this really came from
    Google, for our app, and hasn't expired", not just that it's well-formed
    JSON. Raises AuthenticationFailed on anything that doesn't check out."""
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleSignInNotConfigured()
    try:
        claims = id_token.verify_oauth2_token(
            credential, google_requests.Request(), audience=settings.GOOGLE_CLIENT_ID
        )
    except (ValueError, google_exceptions.GoogleAuthError) as exc:
        raise AuthenticationFailed("That Google sign-in couldn't be verified.") from exc

    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise AuthenticationFailed("That Google sign-in couldn't be verified.")
    if not claims.get("email_verified", False):
        raise AuthenticationFailed("That Google account's email isn't verified.")
    return claims


def _unique_username(base: str) -> str:
    base = _USERNAME_SAFE.sub("", base).strip(".").lower() or "traveller"
    base = base[:24]
    candidate = base
    suffix = 1
    while User.objects.filter(username__iexact=candidate).exists():
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


def get_or_create_google_user(claims: dict) -> tuple[User, bool]:
    """Matches an existing account by Google's account id first, then by
    email (so someone who registered normally can still add Google sign-in
    without ending up with two accounts), and only creates a new one if
    neither matches. Returns (user, created)."""
    sub = claims["sub"]
    email = claims.get("email", "")

    by_google = User.objects.filter(google_sub=sub).first()
    if by_google:
        return by_google, False

    by_email = User.objects.filter(email__iexact=email).first() if email else None
    if by_email:
        by_email.google_sub = sub
        by_email.save(update_fields=["google_sub"])
        return by_email, False

    username = _unique_username(email.split("@")[0] if email else claims.get("name", "traveller"))
    user = User(
        username=username,
        email=email,
        display_name=claims.get("name", "") or username,
        google_sub=sub,
    )
    # No password set at all — Google is the only way into this account
    # unless they later set one from Settings (not built yet, same as any
    # other account that only ever had a security question).
    user.set_unusable_password()
    user.save()
    return user, True
