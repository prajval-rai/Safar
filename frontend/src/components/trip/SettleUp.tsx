"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, Skeleton } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi, useMediaQuery } from "@/lib/hooks";
import type { SettlePayload, SettleTransfer, TripDetail, User } from "@/lib/types";
import { rupees, shortDate } from "@/lib/utils";

/** "Settle up": the fewest payments that square everyone, paid over UPI (or
 *  cash), then confirmed by whoever received the money. */
export function SettleUp({
  trip,
  hasExpenses,
  onChanged,
}: {
  trip: TripDetail;
  hasExpenses: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useCelebration();
  const { data, error, reload } = useApi<SettlePayload>(`/api/trips/${trip.id}/settle/`);
  const [paying, setPaying] = useState<SettleTransfer | null>(null);
  const [busy, setBusy] = useState(false);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data || !user) return <Skeleton className="h-28 w-full rounded-2xl" />;

  const refresh = () => {
    reload();
    onChanged();
  };

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
      refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't do that.", "error");
    } finally {
      setBusy(false);
    }
  }

  const owedToMe = data.transfers.some((t) => t.to_user.id === user.id);
  const history = data.settlements.filter((s) => s.status === "confirmed");

  return (
    <section className="card space-y-4 p-4" aria-labelledby="settle-heading">
      <div>
        <h3 id="settle-heading" className="text-sm font-bold text-ink">
          Settle up
        </h3>
        <p className="text-xs text-muted">The fewest payments that make everyone even.</p>
      </div>

      {/* Say why there's nothing to pay, rather than hiding the section. */}
      {trip.member_count < 2 ? (
        <p className="rounded-xl bg-raised px-3.5 py-3 text-sm text-muted">
          <span aria-hidden="true">👥 </span>It&apos;s just you on this trip. Invite friends from the People tab, add what
          everyone spends, and Safar works out who pays whom — payable over UPI in one tap.
        </p>
      ) : !hasExpenses ? (
        <p className="rounded-xl bg-raised px-3.5 py-3 text-sm text-muted">
          <span aria-hidden="true">🧾 </span>Add expenses as you go. Safar splits them and shows who pays whom here, with
          a <b className="text-ink">Pay via UPI</b> button for whoever owes.
        </p>
      ) : data.transfers.length === 0 ? (
        <p className="rounded-xl bg-success-soft px-3.5 py-3 text-sm font-semibold text-success">
          <span aria-hidden="true">✅ </span>Everyone&apos;s square — nobody owes anything.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data.transfers.map((t) => {
            const iPay = t.from_user.id === user.id;
            const iGet = t.to_user.id === user.id;
            return (
              <li
                key={`${t.from_user.id}-${t.to_user.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
              >
                <Avatar user={iPay ? t.to_user : t.from_user} size="sm" />
                <p className="min-w-0 flex-1 text-sm text-ink">
                  {iPay ? (
                    <>
                      You pay <b>{t.to_user.name}</b>
                    </>
                  ) : iGet ? (
                    <>
                      <b>{t.from_user.name}</b> pays you
                    </>
                  ) : (
                    <>
                      <b>{t.from_user.name}</b> pays <b>{t.to_user.name}</b>
                    </>
                  )}{" "}
                  <b className="text-brand">{rupees(t.amount)}</b>
                </p>

                {t.pending ? (
                  iGet ? (
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () => api.post(`/api/trips/${trip.id}/settlements/${t.pending!.id}/decline/`),
                            "Marked as not received.",
                          )
                        }
                      >
                        Not received
                      </Button>
                      <Button
                        size="sm"
                        icon="✅"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () => api.post(`/api/trips/${trip.id}/settlements/${t.pending!.id}/confirm/`),
                            `Confirmed ${rupees(t.pending!.amount)} from ${t.from_user.name}.`,
                          )
                        }
                      >
                        Got {rupees(t.pending.amount)}
                      </Button>
                    </div>
                  ) : (
                    <Chip tone="warn">
                      {iPay ? `Waiting for ${t.to_user.name.split(" ")[0]} to confirm` : "Paid · awaiting confirmation"}
                    </Chip>
                  )
                ) : iPay ? (
                  <Button size="sm" icon="💸" onClick={() => setPaying(t)}>
                    Pay {rupees(t.amount)}
                  </Button>
                ) : iGet ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          api.post(`/api/trips/${trip.id}/settle/`, {
                            from_user_id: t.from_user.id,
                            amount: t.amount,
                            method: "cash",
                          }),
                        `Recorded ${rupees(t.amount)} from ${t.from_user.name}.`,
                      )
                    }
                  >
                    Got it in cash
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {owedToMe && !data.my_upi_id ? <AddUpiId onSaved={refresh} /> : null}

      {history.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-muted">Settled so far ({history.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {history.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {s.from_user.name} → {s.to_user.name} · {s.method === "cash" ? "Cash" : "UPI"} ·{" "}
                  {shortDate(s.confirmed_at ?? s.created_at)}
                </span>
                <b className="text-ink">{rupees(s.amount)}</b>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <PaySheet
        trip={trip}
        transfer={paying}
        onClose={() => setPaying(null)}
        onPaid={() => {
          setPaying(null);
          refresh();
        }}
      />
    </section>
  );
}

/** Pay one person: their UPI app on a phone, a QR code on a laptop; then
 *  "I've paid" so they can confirm it arrived. */
function PaySheet({
  trip,
  transfer,
  onClose,
  onPaid,
}: {
  trip: TripDetail;
  transfer: SettleTransfer | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { toast } = useCelebration();
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  // Phones open the UPI app straight from the link; elsewhere, scan the QR with one.
  const isPhone = useMediaQuery("(pointer: coarse)");
  const link = transfer?.upi_link ?? "";

  useEffect(() => {
    if (!link) return;
    let active = true;
    QRCode.toDataURL(link, { width: 440, margin: 1 })
      .then((url) => active && setQr(url))
      .catch(() => active && setQr(null));
    return () => {
      active = false;
    };
  }, [link]);

  if (!transfer) return null;
  const payee = transfer.to_user;

  async function markPaid(method: "upi" | "cash") {
    if (!transfer) return;
    setBusy(true);
    try {
      await api.post(`/api/trips/${trip.id}/settle/`, {
        to_user_id: payee.id,
        amount: transfer.amount,
        method,
      });
      toast(`Marked as paid — ${payee.name.split(" ")[0]} will confirm.`);
      onPaid();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(transfer!.to_upi_id);
      toast("UPI ID copied.");
    } catch {
      toast(transfer!.to_upi_id);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Pay ${payee.name}`}
      description={`For ${trip.title}`}
      footer={
        <div className="space-y-2">
          <Button fullWidth size="lg" icon="✅" onClick={() => markPaid("upi")} disabled={busy || !link}>
            I&apos;ve paid {rupees(transfer.amount)}
          </Button>
          <Button fullWidth variant="ghost" onClick={() => markPaid("cash")} disabled={busy}>
            I paid in cash instead
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-center">
        <p className="text-4xl font-extrabold text-ink">{rupees(transfer.amount)}</p>

        {link ? (
          <>
            {isPhone ? (
              <a
                href={link}
                className="tap flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-bold text-on-brand"
              >
                <span aria-hidden="true">📲</span> Pay with a UPI app
              </a>
            ) : null}
            {qr ? (
              <div className="mx-auto w-fit rounded-2xl border border-line bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={`UPI QR code to pay ${payee.name} ${rupees(transfer.amount)}`} className="h-52 w-52" />
              </div>
            ) : null}
            <p className="text-sm text-muted">
              {isPhone ? "Or scan the code from another phone." : "Scan with GPay, PhonePe, Paytm or any UPI app."}
            </p>
            <button
              type="button"
              onClick={copyUpi}
              className="mx-auto flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-soft"
            >
              {transfer.to_upi_id} <span className="text-brand">Copy</span>
            </button>
            <p className="text-xs text-muted">
              Once it&apos;s gone through, tap <b>I&apos;ve paid</b> — {payee.name.split(" ")[0]} confirms it on their side.
            </p>
          </>
        ) : (
          <p className="rounded-xl bg-warn-soft px-3.5 py-3 text-sm text-warn">
            {payee.name} hasn&apos;t added a UPI ID yet. Ask them to add it on their profile — or settle in cash.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Nudge for someone who's owed money but hasn't told Safar where to receive it. */
function AddUpiId({ onSaved }: { onSaved: () => void }) {
  const { setUser } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setUser(await api.patch<User>("/api/auth/me/", { upi_id: value }));
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-brand-soft p-3.5">
      <p className="text-sm font-semibold text-ink">Add your UPI ID so friends can pay you in one tap.</p>
      <div className="mt-2.5 flex gap-2">
        <div className="flex-1">
          <TextField
            label="Your UPI ID"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="name@okaxis"
            error={error ?? undefined}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <div className="flex items-end pb-0.5">
          <Button onClick={save} disabled={busy || !value.includes("@")}>
            Save
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">Only people on your trips can see it.</p>
    </div>
  );
}
