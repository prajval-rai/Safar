"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Chip } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { PastRequirement, PastReviewStatus, TripDetail, TripExperience } from "@/lib/types";
import { cn, formatNumber, relativeTime } from "@/lib/utils";

const REVIEW: Record<PastReviewStatus, { label: string; tone: "neutral" | "warn" | "success" | "danger"; mark: string }> = {
  draft: { label: "Draft", tone: "neutral", mark: "✎" },
  pending: { label: "Waiting for review", tone: "warn", mark: "⏳" },
  approved: { label: "Approved", tone: "success", mark: "✓" },
  rejected: { label: "Needs changes", tone: "danger", mark: "!" },
};

export function reviewBadge(status: PastReviewStatus) {
  return REVIEW[status];
}

/** Which tab fixes each unmet requirement. */
const REQUIREMENT_TAB: Record<PastRequirement["key"], "memories" | "itinerary" | null> = {
  photos: "memories",
  stops: "itinerary",
  story: null,
};

/**
 * The top of a past trip's page: where its review stands, what's still
 * needed before it can be sent, the story, and the submit button.
 */
export function PastTripPanel({
  trip,
  onChanged,
  onGo,
}: {
  trip: TripDetail;
  onChanged: () => void;
  onGo: (tab: "memories" | "itinerary") => void;
}) {
  const info = trip.past_trip!;
  const { toast } = useCelebration();
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const { data: story, reload: reloadStory } = useApi<TripExperience | null>(`/api/trips/${trip.id}/experience/`);
  const isOwner = trip.my_role === "owner";
  const allDone = info.requirements.every((r) => r.done);
  const status = REVIEW[info.review_status];
  const xp = Number(info.approval_xp) + (info.has_story ? Number(info.story_xp) : 0);

  async function send(action: "submit-review" | "withdraw-review", message: string) {
    setBusy(true);
    try {
      await api.post(`/api/trips/${trip.id}/${action}/`);
      toast(message);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't do that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="past-trip-heading"
      className={cn(
        "card space-y-4 p-4",
        info.review_status === "rejected" && "border-danger/30",
        info.review_status === "approved" && "border-success/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="past-trip-heading" className="flex flex-wrap items-center gap-2 text-lg font-extrabold text-ink">
            <span aria-hidden="true">🕰️</span> Past trip
            <Chip tone={status.tone}>
              <span aria-hidden="true">{status.mark}</span> {status.label}
            </Chip>
          </h2>
          <p className="mt-1 text-sm text-muted">{statusLine(info.review_status, info.submitted_at, xp)}</p>
        </div>
      </div>

      {info.review_note && (info.review_status === "rejected" || info.review_status === "approved") ? (
        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-sm",
            info.review_status === "rejected" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
          )}
        >
          <b>{info.reviewed_by ? `${info.reviewed_by.name}: ` : "Admin: "}</b>
          {info.review_note}
        </div>
      ) : null}

      {info.review_status !== "approved" ? (
        <ul className="space-y-2" aria-label="Before you can submit">
          {info.requirements.map((row) => {
            const tab = REQUIREMENT_TAB[row.key];
            return (
              <li key={row.key} className="flex items-center gap-3 rounded-xl bg-raised px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    row.done ? "bg-success text-white" : "border-2 border-line text-muted",
                  )}
                >
                  {row.done ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className={cn("font-semibold", row.done ? "text-muted" : "text-ink")}>{row.label}</span>
                  {row.key !== "story" ? (
                    <span className="ml-1.5 text-muted">
                      ({row.have}/{row.need})
                    </span>
                  ) : null}
                  <span className="sr-only-text">{row.done ? " — done" : " — still to do"}</span>
                </span>
                {!row.done && info.editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => (tab ? onGo(tab) : setWriting(true))}
                  >
                    {row.key === "photos" ? "Add photos" : row.key === "stops" ? "Add stops" : "Write"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <StoryCard
        story={story ?? null}
        approved={info.review_status === "approved"}
        editable={info.editable && isOwner}
        onWrite={() => setWriting(true)}
      />

      {isOwner && info.editable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="min-w-0 flex-1 text-sm text-muted">
            {allDone
              ? "All set. Every admin gets notified, and you'll hear back once it's reviewed."
              : "Tick everything off above to send it for review."}
          </p>
          <Button
            size="lg"
            icon="📨"
            disabled={busy || !allDone}
            onClick={() => send("submit-review", "Sent for review. We'll let you know.")}
          >
            {busy ? "Sending…" : info.review_status === "rejected" ? "Send again" : "Submit for review"}
          </Button>
        </div>
      ) : null}

      {isOwner && info.review_status === "pending" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Locked while it&apos;s being reviewed. Need to change something? Take it back, edit, and send it again.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => send("withdraw-review", "Taken back — it's a draft again.")}
          >
            Withdraw
          </Button>
        </div>
      ) : null}

      {writing ? (
        <StorySheet
          trip={trip}
          story={story ?? null}
          onClose={() => setWriting(false)}
          onSaved={() => {
            setWriting(false);
            reloadStory();
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

function statusLine(status: PastReviewStatus, submittedAt: string | null, xp: number): string {
  const reward = xp > 0 ? ` Approval earns +${formatNumber(xp)} XP.` : "";
  switch (status) {
    case "draft":
      return `Add what you did, your photos and your story, then send it to the admins.${reward}`;
    case "pending":
      return `Sent ${submittedAt ? relativeTime(submittedAt) : ""} — an admin is checking your photos and plan.${reward}`;
    case "approved":
      return "Checked and approved — it counts like any trip you've finished.";
    case "rejected":
      return "An admin couldn't approve it yet. Fix what they mention and send it again.";
  }
}

/* ------------------------------------------------------------------ story */

function StoryCard({
  story,
  approved,
  editable,
  onWrite,
}: {
  story: TripExperience | null;
  approved: boolean;
  editable: boolean;
  onWrite: () => void;
}) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <span aria-hidden="true">📝</span> Your story
          {story ? (
            <Chip tone={story.is_public ? "brand" : "neutral"}>
              {story.is_public ? "🌍 Public on the Feed" : "🔒 Private"}
            </Chip>
          ) : null}
        </h3>
        {editable ? (
          <Button size="sm" variant="secondary" onClick={onWrite}>
            {story ? "Edit" : "Write it"}
          </Button>
        ) : null}
      </div>
      {story ? (
        <p className="mt-2 line-clamp-4 text-sm whitespace-pre-line text-ink">{story.text}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          {editable
            ? "The best moment, what you'd skip, tips for whoever goes next."
            : "No story written for this trip."}
        </p>
      )}
      {story?.is_public && !approved ? (
        <p className="mt-2 text-xs text-muted">It goes up on the Feed once the trip is approved.</p>
      ) : null}
    </div>
  );
}

/** Tick box for "share this to the public Feed" — used wherever a trip story is written. */
export function ShareToFeedToggle({
  checked,
  onChange,
  disabled,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className={cn("flex min-h-[44px] cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
      />
      <span>
        <span className="block text-[15px] font-semibold text-ink">Share it publicly on the Feed</span>
        <span className="block text-sm text-muted">
          {hint ?? "Anyone can read it there. Untick to keep it just on this trip."}
        </span>
      </span>
    </label>
  );
}

function StorySheet({
  trip,
  story,
  onClose,
  onSaved,
}: {
  trip: TripDetail;
  story: TripExperience | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const info = trip.past_trip!;
  const { toast } = useCelebration();
  const [value, setValue] = useState(story?.text ?? "");
  const [isPublic, setIsPublic] = useState(story?.is_public ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shared = info.allow_public_story && isPublic;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/trips/${trip.id}/experience/`, { text: value.trim(), is_public: shared });
      toast(shared ? "Story saved — it goes on the Feed once approved." : "Story saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Your story of ${trip.title}`}
      description={`${trip.destination} · written after the trip`}
      footer={
        <Button fullWidth size="lg" icon="📝" onClick={save} disabled={busy || value.trim().length < 10}>
          {busy ? "Saving…" : "Save story"}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextAreaField
          label="How was it?"
          hint="Day by day or all at once — the best moments, what you'd skip, tips for whoever goes next."
          data-autofocus
          value={value}
          error={error ?? undefined}
          onChange={(e) => setValue(e.target.value)}
          maxLength={50_000}
          rows={10}
        />
        <ShareToFeedToggle
          checked={shared}
          onChange={setIsPublic}
          disabled={!info.allow_public_story}
          hint={
            info.allow_public_story
              ? "It goes up on the Feed once an admin approves the trip. Untick to keep it just on this trip."
              : "Stories from past trips stay on the trip for now."
          }
        />
      </div>
    </Sheet>
  );
}
