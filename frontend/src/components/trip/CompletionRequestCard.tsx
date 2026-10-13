"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api";
import type { TripDetail } from "@/lib/types";

/** No signal at the stops, so nothing could be marked done? The organiser
 *  sends the trip to an admin instead, with photos as the proof; the admin
 *  confirms it and the trip is completed. Everyone sees where it stands. */
export function CompletionRequestCard({
  trip,
  canEdit,
  onAddPhotos,
  onChanged,
}: {
  trip: TripDetail;
  canEdit: boolean;
  onAddPhotos: () => void;
  onChanged: () => void;
}) {
  const { toast } = useCelebration();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const review = trip.completion_review;
  if (!review) return null;
  if (trip.status === "completed" && review.status !== "approved") return null;

  async function send() {
    setBusy(true);
    try {
      await api.post(`/api/trips/${trip.id}/request-completion/`, { note: note.trim() });
      toast("Sent to an admin — you'll hear when they've looked at it.");
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't send it.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (review.status === "approved") {
    return (
      <section className="card bg-success-soft p-4">
        <p className="font-bold text-success">✅ Confirmed by an admin from its photos</p>
        {review.note ? <p className="mt-1 text-sm text-ink">{review.note}</p> : null}
      </section>
    );
  }

  if (review.status === "pending") {
    return (
      <section className="card bg-warn-soft p-4">
        <p className="font-bold text-warn">⏳ Waiting for an admin</p>
        <p className="mt-1 text-sm text-ink">
          Sent for confirmation with {review.photos} photos. Everyone will hear when it&apos;s done.
        </p>
      </section>
    );
  }

  // Not asked yet, or turned down: only organisers can (re)send it.
  if (!canEdit) return null;
  const enough = review.photos >= review.photos_needed;

  return (
    <section className="card space-y-3 p-4" aria-labelledby="completion-heading">
      <div>
        <h2 id="completion-heading" className="font-bold text-ink">
          🛡️ {review.status === "rejected" ? "Send it again" : "Couldn't mark it done in the app?"}
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          No signal at the stops? Send the trip to an admin with photos from it — once they confirm, it&apos;s completed
          for everyone.
        </p>
      </div>
      {review.status === "rejected" && review.note ? (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">Admin: {review.note}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={enough ? "font-semibold text-success" : "text-ink"}>
          {enough ? "✓ " : ""}
          {review.photos} of {review.photos_needed} photos needed
        </span>
        {!enough ? (
          <Button size="sm" variant="secondary" onClick={onAddPhotos}>
            Add photos
          </Button>
        ) : null}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 300))}
        rows={2}
        placeholder="Anything the admin should know? (optional)"
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted focus:border-brand focus:outline-none"
      />
      <Button fullWidth onClick={send} disabled={busy || !enough}>
        {busy ? "Sending…" : "Send to admin for review"}
      </Button>
    </section>
  );
}
