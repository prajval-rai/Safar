"""Settling up a trip's expenses: who should pay whom, and UPI payment links.

Balances come from trips.views.trip_expense_balances (paid − fair share, with
confirmed settlements already counted). From those, `suggested_transfers`
finds a short list of payments that squares everyone up — the fewest a
simple greedy pass can manage, which for a trip-sized group is effectively
the minimum.
"""

import re
from urllib.parse import quote

# name@bank — what every UPI app accepts as a payee address (VPA).
UPI_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{1,254}@[a-z][a-z0-9]{1,63}$")


def normalise_upi_id(raw: str) -> str:
    return raw.strip().lower()


def is_valid_upi_id(value: str) -> bool:
    return bool(UPI_ID.match(value))


def suggested_transfers(balances: list[dict]) -> list[dict]:
    """[{"from": user, "to": user, "amount": int}] — largest debts first, each
    paid to whoever is owed the most, until everyone is within ₹1 of even."""
    owes = sorted(
        ([b["user"], -b["balance"]] for b in balances if b["balance"] < 0),
        key=lambda row: -row[1],
    )
    owed = sorted(
        ([b["user"], b["balance"]] for b in balances if b["balance"] > 0),
        key=lambda row: -row[1],
    )
    transfers = []
    i = j = 0
    while i < len(owes) and j < len(owed):
        amount = min(owes[i][1], owed[j][1])
        if amount >= 1:
            transfers.append({"from": owes[i][0], "to": owed[j][0], "amount": amount})
        owes[i][1] -= amount
        owed[j][1] -= amount
        if owes[i][1] < 1:
            i += 1
        if owed[j][1] < 1:
            j += 1
    return transfers


def upi_link(upi_id: str, name: str, amount: int, note: str) -> str:
    """The standard UPI intent (NPCI's upi://pay) — opens GPay, PhonePe, Paytm,
    BHIM or any UPI app with the payee and amount filled in."""
    params = {
        "pa": upi_id,
        "pn": name,
        "am": f"{amount:.2f}",
        "cu": "INR",
        "tn": note[:50],
    }
    return "upi://pay?" + "&".join(f"{k}={quote(str(v), safe='@.')}" for k, v in params.items())


# --- XP that waits for settling up ---------------------------------------------------

def owes_money(balances: list[dict], user) -> bool:
    """Still owes at least ₹1 on the trip (confirmed payments only)."""
    return any(b["user"].id == user.id and b["balance"] <= -1 for b in balances)


def award_or_hold(trip, user, amount: int, reason: str, balances: list[dict]) -> int:
    """Completion XP: paid now if `user` doesn't owe anything, otherwise held
    until they settle. Returns what was paid now."""
    from rewards.services import award_xp, hold_xp

    if owes_money(balances, user):
        hold_xp(user, amount, reason, kind="trip", trip=trip)
        return 0
    award_xp(user, amount, reason, kind="trip", trip=trip)
    return amount


def take_back(trip, user, amount: int, reason: str) -> None:
    """Undo a completion reward: drop it if it was still held, otherwise
    deduct it like any other reversal."""
    from rewards.models import HeldXP
    from rewards.services import award_xp

    held = HeldXP.objects.filter(user=user, trip=trip, released_at=None, amount=amount).first()
    if held:
        held.delete()
    else:
        award_xp(user, -amount, reason, kind="trip", trip=trip)


def release_if_settled(trip) -> None:
    """After money moves (a payment confirmed, an expense changed), pay out
    held XP for anyone who no longer owes anything on this trip."""
    from notifications.services import notify
    from rewards.models import HeldXP
    from rewards.services import release_held_xp

    from .views import trip_expense_balances

    waiting = HeldXP.objects.filter(trip=trip, released_at=None).select_related("user")
    if not waiting.exists():
        return
    balances = trip_expense_balances(trip)
    for user in {h.user for h in waiting}:
        if owes_money(balances, user):
            continue
        released = release_held_xp(user, trip)
        if released:
            notify(
                user,
                "xp_released",
                f"+{released} XP unlocked for {trip.title}",
                body="You're all settled up — your trip-completion XP is yours.",
                trip=trip,
            )
