"""Refer a friend: everyone has a personal link (/login?ref=<code>). Someone
who creates their Safar account from it is linked to whoever shared it. Only a
brand-new account counts — an existing one signing in through the link changes
nothing — so each person can only ever be referred once.

The REFERRAL_XP isn't paid at signup — a pile of throwaway Google accounts
would be free XP. It's paid once the new traveller finishes their first real
trip (checked in on the spot at a completed stop), and each referrer is paid
for at most MAX_REFERRALS_PER_MONTH of those in any 30 days.
"""

from datetime import timedelta

import secrets
import string

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

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
    """Link `new_user` to the owner of `code`. Call it only for an account that
    was just created. Returns the referrer, or None when the code doesn't
    match anyone (a bad code never blocks signing up)."""
    from notifications.services import notify
    from rewards.services import REFERRAL_XP

    code = (code or "").strip().upper()
    if not code or new_user.referred_by_id:
        return None
    referrer = User.objects.filter(referral_code=code, is_active=True).exclude(pk=new_user.pk).first()
    if not referrer:
        return None
    new_user.referred_by = referrer
    new_user.save(update_fields=["referred_by"])
    notify(
        referrer,
        "referral_joined",
        f"{new_user.name} joined Safar with your link 🎉",
        actor=new_user,
        body=f"You'll get +{REFERRAL_XP} XP once they finish their first trip.",
    )
    return referrer


@transaction.atomic
def pay_referral_if_due(user):
    """`user` just finished a real trip: pay whoever referred them, once —
    unless that referrer has already been paid for MAX_REFERRALS_PER_MONTH
    referrals in the last 30 days (then it's paid on a later trip, once
    there's room). Returns the XP paid."""
    from notifications.services import notify
    from rewards.services import MAX_REFERRALS_PER_MONTH, REFERRAL_XP, award_xp

    user = User.objects.select_for_update().get(pk=user.pk)
    referrer = user.referred_by
    if referrer is None or user.referral_paid_at or not referrer.is_active:
        return 0
    recent = User.objects.filter(
        referred_by=referrer, referral_paid_at__gte=timezone.now() - timedelta(days=30)
    ).count()
    if recent >= MAX_REFERRALS_PER_MONTH:
        return 0
    user.referral_paid_at = timezone.now()
    user.save(update_fields=["referral_paid_at"])
    award_xp(referrer, REFERRAL_XP, f"Referred {user.name} to Safar", kind="bonus", capped=False)
    notify(
        referrer,
        "referral_joined",
        f"{user.name} finished their first trip 🎉",
        actor=user,
        body=f"+{REFERRAL_XP} XP for the referral.",
    )
    return REFERRAL_XP
