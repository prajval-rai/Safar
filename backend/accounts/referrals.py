"""Refer a friend: everyone has a personal link (/login?ref=<code>). When
someone creates their Safar account from it, the person who shared it earns
REFERRAL_XP. Only a brand-new account counts — an existing one signing in
through the link changes nothing — so each person can only ever be referred once.
"""

import secrets
import string

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

User = get_user_model()

# No 0/O or 1/I, so a code read out loud or typed from a screenshot still works.
_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "0O1I")
CODE_LENGTH = 8


def referral_code_for(user) -> str:
    """The user's code, made (and saved) the first time it's needed."""
    if user.referral_code:
        return user.referral_code
    for _ in range(10):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(CODE_LENGTH))
        try:
            with transaction.atomic():
                updated = User.objects.filter(pk=user.pk, referral_code__isnull=True).update(referral_code=code)
        except IntegrityError:
            continue  # Someone else already has that code — try another.
        if not updated:
            # Made by a request running at the same time; use that one.
            user.referral_code = User.objects.values_list("referral_code", flat=True).get(pk=user.pk)
        else:
            user.referral_code = code
        return user.referral_code
    raise RuntimeError("Couldn't make a unique referral code.")


def apply_referral(new_user, code: str):
    """Credit the owner of `code` for `new_user`'s signup. Call it only for an
    account that was just created. Returns the referrer, or None when the code
    doesn't match anyone (a bad code never blocks signing up)."""
    from notifications.services import notify
    from rewards.services import REFERRAL_XP, award_xp

    code = (code or "").strip().upper()
    if not code or new_user.referred_by_id:
        return None
    referrer = User.objects.filter(referral_code=code, is_active=True).exclude(pk=new_user.pk).first()
    if not referrer:
        return None
    new_user.referred_by = referrer
    new_user.save(update_fields=["referred_by"])
    award_xp(referrer, REFERRAL_XP, f"Referred {new_user.name} to Safar", kind="bonus")
    notify(
        referrer,
        "referral_joined",
        f"{new_user.name} joined Safar with your link 🎉",
        actor=new_user,
        body=f"+{REFERRAL_XP} XP for the referral.",
    )
    return referrer
