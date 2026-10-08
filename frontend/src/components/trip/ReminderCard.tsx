"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import type { TripDetail } from "@/lib/types";

const DAYS_BEFORE = [
  { value: 0, label: "Same day" },
  { value: 1, label: "1 day before" },
  { value: 2, label: "2 days before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "A week before" },
];
const TIMES = [
  { value: 7, label: "7 AM" },
  { value: 9, label: "9 AM" },
  { value: 13, label: "1 PM" },
  { value: 18, label: "6 PM" },
  { value: 21, label: "9 PM" },
];

const WHEN_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

/** When the "trip's coming up" reminder reaches everyone — with a nudge about
 *  anything left on their checklist. Organisers set it; everyone sees it.
 *  Without one, everyone gets the default reminder the day before. */
export function ReminderCard({
  trip,
  canEdit,
  onChanged,
}: {
  trip: TripDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (trip.status !== "planning" || trip.is_past) return null;

  const at = trip.pre_start_reminder_at ? new Date(trip.pre_start_reminder_at) : null;

  return (
    <section className="card p-4" aria-labelledby="reminder-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="reminder-heading" className="text-sm font-bold text-muted">
            ⏰ Reminder before the trip
          </h2>
          <p className="mt-1 text-[15px] font-semibold text-ink">
            {at ? at.toLocaleString(undefined, WHEN_FORMAT) : "The day before the trip (default)"}
          </p>
          {trip.pre_start_reminder_note ? (
            <p className="mt-0.5 text-sm text-muted">“{trip.pre_start_reminder_note}”</p>
          ) : null}
          <p className="mt-1 text-xs text-muted">
            Everyone gets it, plus a nudge about anything left on their checklist.
          </p>
        </div>
        {canEdit ? (
          <Button size="sm" variant={at ? "secondary" : "primary"} onClick={() => setOpen(true)}>
            {at ? "Change reminder" : "Set reminder time"}
          </Button>
        ) : null}
      </div>
      {/* Mounted only while open, so it starts fresh (and with the current time) each time. */}
      {canEdit && open ? <ReminderSheet trip={trip} onClose={() => setOpen(false)} onSaved={onChanged} /> : null}
    </section>
  );
}

function ReminderSheet({ trip, onClose, onSaved }: { trip: TripDetail; onClose: () => void; onSaved: () => void }) {
  const { toast } = useCelebration();
  const [days, setDays] = useState(1);
  const [hour, setHour] = useState(18);
  const [note, setNote] = useState(trip.pre_start_reminder_note ?? "");
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  // The chosen day and hour, in this browser's local time.
  const [y, m, d] = trip.start_date.split("-").map(Number);
  const chosen = new Date(y, m - 1, d - days, hour, 0, 0);
  const inPast = chosen.getTime() <= now;

  async function save(clear = false) {
    setBusy(true);
    try {
      await api.post(
        `/api/trips/${trip.id}/reminder/`,
        clear ? { at: null, note: "" } : { at: chosen.toISOString(), note: note.trim() },
      );
      toast(clear ? "Back to the default reminder." : "Reminder set.");
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the reminder.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Remind everyone"
      description={`When should the group hear that ${trip.title} is coming up?`}
      footer={
        <div className="space-y-2">
          <Button fullWidth size="lg" onClick={() => save()} disabled={busy || inPast}>
            {busy ? "Saving…" : "Save reminder"}
          </Button>
          {trip.pre_start_reminder_at ? (
            <Button fullWidth variant="ghost" onClick={() => save(true)} disabled={busy}>
              Use the default (day before) instead
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        <ChoiceRow label="Day" options={DAYS_BEFORE} value={days} onChange={setDays} />
        <ChoiceRow label="Time" options={TIMES} value={hour} onChange={setHour} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Note for everyone (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            rows={2}
            placeholder="Meet at Dadar station, 6 AM. Bring your ID."
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </label>
        <p className={`text-sm ${inPast ? "font-semibold text-danger" : "text-muted"}`}>
          {inPast
            ? "That time has already passed — pick a later one."
            : `Goes out ${chosen.toLocaleString(undefined, { ...WHEN_FORMAT, weekday: "long" })}.`}
        </p>
      </div>
    </Sheet>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`min-h-[40px] rounded-full border px-3.5 text-sm font-semibold ${
              value === o.value
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-ink hover:bg-raised"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
