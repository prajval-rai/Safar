"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { AdminPastTrip, AdminPastTripPage, PastReviewStatus, PastTripConfig } from "@/lib/types";
import {
  CATEGORY_ICONS,
  TRANSPORT_LABELS,
  TRIP_TYPE_LABELS,
  cn,
  dateRange,
  relativeTime,
  rupees,
} from "@/lib/utils";

type QueueFilter = Exclude<PastReviewStatus, "draft"> | "all";

const REVIEW_STYLE: Record<PastReviewStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-raised text-muted" },
  pending: { label: "Pending", className: "bg-warn-soft text-warn" },
  approved: { label: "Approved", className: "bg-success-soft text-success" },
  rejected: { label: "Rejected", className: "bg-danger-soft text-danger" },
};

/* ------------------------------------------------------------------ queue */

/**
 * Past trips travellers have sent in. Every admin is notified when one
 * arrives; any of them can open it, look through the photos, itinerary and
 * story, and approve it or send it back with a note.
 */
export function PastTripsPanel({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<QueueFilter>("pending");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const params = new URLSearchParams({ status, v: String(version) });
  if (query.trim().length >= 2) params.set("q", query.trim());
  const { data, loading, error, reload } = useApi<AdminPastTripPage>(`/api/admin/past-trips/?${params}`);
  const trips = data?.results ?? [];

  return (
    <div className="space-y-3">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
          {(["pending", "approved", "rejected", "all"] as QueueFilter[]).map((value) => {
            const count = value === "all" ? undefined : data?.counts[value];
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={cn(
                  "min-h-[38px] shrink-0 rounded-full border px-3.5 text-sm font-semibold capitalize",
                  status === value ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink hover:bg-raised",
                )}
              >
                {value}
                {count ? <span className="ml-1.5 opacity-80">{count}</span> : null}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search traveller, trip or place"
          aria-label="Search past trips"
          className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
      </div>

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : trips.length ? (
        <ul className="card divide-y divide-[var(--line)]">
          {trips.map((trip) => (
            <li key={trip.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-soft">
                  {trip.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={trip.photos[0].url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-2xl" aria-hidden="true">
                      🕰️
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{trip.title}</p>
                  <p className="truncate text-sm text-muted">
                    📍 {trip.destination}
                    {trip.region ? `, ${trip.region}` : ""} · {dateRange(trip.start_date, trip.end_date)}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                    <Avatar user={trip.created_by} size="sm" />
                    <span className="truncate">
                      <b className="text-ink">{trip.created_by.name}</b> @{trip.created_by.username}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {trip.photo_count} photos · {trip.stop_count} stops{trip.story ? " · story" : ""}
                    {trip.submitted_at ? ` · sent ${relativeTime(trip.submitted_at)}` : ""}
                    {trip.reviewed_by && trip.reviewed_at
                      ? ` · ${REVIEW_STYLE[trip.review_status].label.toLowerCase()} by ${trip.reviewed_by.name} ${relativeTime(trip.reviewed_at)}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", REVIEW_STYLE[trip.review_status].className)}>
                  {REVIEW_STYLE[trip.review_status].label}
                </span>
                <Button size="sm" variant={trip.review_status === "pending" ? "primary" : "secondary"} onClick={() => setOpen(trip.id)}>
                  {trip.review_status === "pending" ? "Review" : "View"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-8 text-center text-sm text-muted">
          {status === "pending" ? "Nothing waiting — every past trip has been reviewed. 🎉" : "No past trips match."}
        </p>
      )}

      {open ? (
        <ReviewSheet
          key={open}
          id={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            setVersion((v) => v + 1);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- review */

function ReviewSheet({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { data: trip, loading, error, reload } = useApi<AdminPastTrip>(`/api/admin/past-trips/${id}/`);
  const { toast } = useCelebration();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const pending = trip?.review_status === "pending";

  async function decide(decision: "approve" | "reject") {
    if (!trip) return;
    if (decision === "reject" && !note.trim()) {
      setNoteError("Say why, so they know what to fix.");
      return;
    }
    setBusy(decision);
    try {
      await api.post(`/api/admin/past-trips/${trip.id}/review/`, { decision, note: note.trim() });
      toast(decision === "approve" ? `${trip.title} approved.` : `${trip.title} sent back to ${trip.created_by.name}.`);
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that review.", "error");
      setBusy(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={trip ? trip.title : "Past trip"}
      description={
        trip
          ? `${trip.created_by.name} (@${trip.created_by.username}) · ${trip.destination} · ${dateRange(trip.start_date, trip.end_date)}`
          : undefined
      }
      footer={
        pending ? (
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => decide("reject")} disabled={busy !== null}>
              {busy === "reject" ? "Sending back…" : "Reject"}
            </Button>
            <Button fullWidth icon="✅" onClick={() => decide("approve")} disabled={busy !== null}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading && !trip ? <LoadingBlock /> : null}
      {error && !trip ? <ErrorNote message={error} onRetry={reload} /> : null}
      {trip ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", REVIEW_STYLE[trip.review_status].className)}>
              {REVIEW_STYLE[trip.review_status].label}
            </span>
            <Chip>{TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type}</Chip>
            <Chip>{TRANSPORT_LABELS[trip.transport] ?? trip.transport}</Chip>
            <Chip>{trip.duration_days} days</Chip>
            {trip.budget_per_person ? <Chip>{rupees(trip.budget_per_person)} / person</Chip> : null}
          </div>
          {trip.summary ? <p className="text-[15px] text-ink">{trip.summary}</p> : null}

          {trip.review_note && !pending ? (
            <p className="rounded-xl bg-raised px-3.5 py-2.5 text-sm text-ink">
              <b>{trip.reviewed_by?.name ?? "Admin"}:</b> {trip.review_note}
            </p>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-bold text-muted">Photos ({trip.photos.length})</h3>
            {trip.photos.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {trip.photos.map((photo) => (
                  <li key={photo.id}>
                    <a href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption || "Trip photo"}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition-transform hover:scale-105"
                      />
                    </a>
                    {photo.caption ? <p className="mt-1 truncate text-xs text-muted">{photo.caption}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No photos.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold text-muted">Itinerary ({trip.stop_count} stops)</h3>
            <ol className="space-y-3">
              {trip.days.map((day) => (
                <li key={day.index} className="rounded-xl border border-line p-3">
                  <p className="text-sm font-bold text-ink">
                    Day {day.index}
                    {day.title ? ` · ${day.title}` : ""}
                  </p>
                  {day.notes ? <p className="mt-0.5 text-sm text-muted">{day.notes}</p> : null}
                  {day.stops.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {day.stops.map((stop) => (
                        <li key={stop.id} className="text-sm text-ink">
                          <span aria-hidden="true">{CATEGORY_ICONS[stop.category] ?? "📍"} </span>
                          <b>{stop.title}</b>
                          {stop.place_name && stop.place_name !== stop.title ? (
                            <span className="text-muted"> · {stop.place_name}</span>
                          ) : null}
                          {stop.start_time ? <span className="text-muted"> · {stop.start_time.slice(0, 5)}</span> : null}
                          {stop.notes ? <span className="block pl-6 text-xs text-muted">{stop.notes}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Nothing added for this day.</p>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-muted">
              Story
              {trip.story ? (
                <Chip tone={trip.story.is_public ? "brand" : "neutral"}>
                  {trip.story.is_public ? "Goes on the Feed" : "Private"}
                </Chip>
              ) : null}
            </h3>
            {trip.story ? (
              <p className="max-h-64 overflow-y-auto rounded-xl bg-raised p-3 text-sm whitespace-pre-line text-ink">
                {trip.story.text}
              </p>
            ) : (
              <p className="text-sm text-muted">No story written.</p>
            )}
          </section>

          {pending ? (
            <TextAreaField
              label="Note to the traveller"
              value={note}
              maxLength={300}
              error={noteError}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteError(undefined);
              }}
              hint="Optional when approving. Needed to reject — say what to fix, and they can send it again."
            />
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ rules */

type RulesForm = Omit<PastTripConfig, "updated_by" | "updated_at">;

/** The rules every past trip is held to — how many photos, XP on approval, … */
export function PastTripRules() {
  const { data, loading, error, reload } = useApi<PastTripConfig>("/api/past-trips/config/");
  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;
  return <RulesEditor key={data.updated_at} config={data} onSaved={reload} />;
}

function RulesEditor({ config, onSaved }: { config: PastTripConfig; onSaved: () => void }) {
  const { toast } = useCelebration();
  const [form, setForm] = useState<RulesForm>(() => ({
    enabled: config.enabled,
    min_photos: config.min_photos,
    max_photos: config.max_photos,
    min_stops: config.min_stops,
    require_story: config.require_story,
    min_story_chars: config.min_story_chars,
    allow_public_story: config.allow_public_story,
    max_age_days: config.max_age_days,
    approval_xp: Number(config.approval_xp),
    story_xp: Number(config.story_xp),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function set<K extends keyof RulesForm>(key: K, value: RulesForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  const whole = (key: "min_photos" | "max_photos" | "min_stops" | "min_story_chars" | "max_age_days") => ({
    type: "number" as const,
    inputMode: "numeric" as const,
    min: 0,
    value: String(form[key]),
    error: errors[key] || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, Math.max(0, Math.floor(Number(e.target.value) || 0))),
  });

  async function save() {
    setBusy(true);
    try {
      await api.patch("/api/past-trips/config/", form);
      toast("Past trip rules saved.");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast(err instanceof ApiError ? err.message : "Couldn't save the rules.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-muted">Past trips</h2>
        <Toggle
          checked={form.enabled}
          onChange={(v) => set("enabled", v)}
          title="Accept past trips"
          line="Off: nobody can log or submit a new one. Anything already waiting can still be reviewed."
        />
        <TextField
          label="How far back (days)"
          hint="A past trip must have ended within this many days of today."
          {...whole("max_age_days")}
        />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-muted">What they need to submit</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Photos needed" hint="The proof you look at when reviewing." {...whole("min_photos")} />
          <TextField label="Most photos allowed" {...whole("max_photos")} />
          <TextField label="Itinerary stops needed" {...whole("min_stops")} />
          <TextField
            label="Shortest story (characters)"
            hint="Only applies when a story is required."
            {...whole("min_story_chars")}
          />
        </div>
        <Toggle
          checked={form.require_story}
          onChange={(v) => set("require_story", v)}
          title="Require a written story"
          line="Off: the story is optional."
        />
        <Toggle
          checked={form.allow_public_story}
          onChange={(v) => set("allow_public_story", v)}
          title="Allow stories on the public Feed"
          line="On: travellers choose public or private, and public stories go on the Feed once approved. Off: they stay on the trip."
        />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-muted">XP on approval</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="For the trip"
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step={0.5}
            value={String(form.approval_xp)}
            error={errors.approval_xp || undefined}
            onChange={(e) => set("approval_xp", Number(e.target.value) || 0)}
            hint="0–10. Paid once, when you approve."
          />
          <TextField
            label="For a story"
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step={0.5}
            value={String(form.story_xp)}
            error={errors.story_xp || undefined}
            onChange={(e) => set("story_xp", Number(e.target.value) || 0)}
            hint="0–10. Added when the approved trip has a story."
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {config.updated_by ? `Last changed by ${config.updated_by.name} ${relativeTime(config.updated_at)}.` : ""}
        </p>
        <Button size="lg" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save rules"}
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  line,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  line: string;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
      />
      <span>
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-sm text-muted">{line}</span>
      </span>
    </label>
  );
}
