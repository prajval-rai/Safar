"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { useAuth } from "@/components/providers/AuthProvider";
import { DiscoverSheet } from "@/components/maps/DiscoverSheet";
import { PlacePhoto } from "@/components/maps/PlacePhoto";
import { PlaceSearch } from "@/components/maps/PlaceSearch";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Chip, Progress, Skeleton } from "@/components/ui/Bits";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { canCompleteStop, checkInStop, completeStop, isPinned } from "@/lib/geo";
import { usePlaceSearch } from "@/lib/places";
import type { Activity, Day, PickedPlace, TripDetail, TripMember, XPResult } from "@/lib/types";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  cn,
  clockTime,
  dayLabel,
  describeDistance,
  distanceKm,
  mapsLink,
  rupees,
  shortDate,
  timeWindow,
} from "@/lib/utils";

interface Props {
  trip: TripDetail;
  onChanged: () => void;
  /** Only owners and co-planners may edit the plan. */
  canEdit: boolean;
}

export function Itinerary({ trip, onChanged, canEdit }: Props) {
  const [openDay, setOpenDay] = useState<number>(() => {
    const unfinished = trip.days.find((day) => !day.is_complete);
    return (unfinished ?? trip.days[0])?.index ?? 1;
  });
  const [addingTo, setAddingTo] = useState<Day | null>(null);
  const [detail, setDetail] = useState<Activity | null>(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const { toast } = useCelebration();
  const { user } = useAuth();

  async function generate(day: Day) {
    try {
      await api.post(`/api/trips/${trip.id}/generate-plan/`, { day_index: day.index });
      toast(`Day ${day.index} filled in — edit anything you like.`);
      onChanged();
    } catch {
      toast("Couldn't build that plan.", "error");
    }
  }

  if (!trip.days.length) {
    return (
      <EmptyState
        emoji="🗓️"
        title="Your journey starts here."
        line="Add the days you'll be travelling and we'll build the plan around them."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Day strip: quick jump without scrolling the whole itinerary. */}
      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {trip.days.map((day) => (
          <button
            key={day.id}
            type="button"
            onClick={() => setOpenDay(day.index)}
            aria-pressed={openDay === day.index}
            className={cn(
              "flex min-h-[58px] shrink-0 flex-col items-start rounded-xl border px-3.5 py-2 text-left transition-colors",
              openDay === day.index
                ? "border-brand bg-brand-soft"
                : "border-line bg-surface hover:bg-raised",
            )}
          >
            <span className="text-xs font-semibold text-muted">Day {day.index}</span>
            <span className="text-sm font-bold text-ink">{shortDate(day.date)}</span>
            <span className="mt-0.5 text-[11px] font-semibold text-muted">
              {day.is_complete ? "✓ Done" : `${day.activities.length} planned`}
            </span>
          </button>
        ))}
      </div>

      {trip.days
        .filter((day) => day.index === openDay)
        .map((day) => (
          <section key={day.id} className="card p-4">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">
                  Day {day.index} · {dayLabel(day.date)}
                </h3>
                <p className="text-sm text-muted">
                  {shortDate(day.date)}
                  {day.title ? ` · ${day.title}` : ""}
                </p>
              </div>
              {day.activities.length ? (
                <div className="w-full sm:w-44">
                  <Progress
                    value={day.progress_percent}
                    size="sm"
                    label={`${day.activities.filter((a) => a.status === "completed").length} of ${day.activities.length} done`}
                    tone={day.is_complete ? "success" : "brand"}
                  />
                </div>
              ) : null}
            </header>

            {day.activities.length ? (
              <ol className="space-y-0">
                {day.activities.map((activity, index) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    previous={index > 0 ? day.activities[index - 1] : null}
                    isLast={index === day.activities.length - 1}
                    canEdit={canEdit}
                    myId={user?.id}
                    dayCount={trip.days.length}
                    onOpen={() => setDetail(activity)}
                    onChanged={onChanged}
                  />
                ))}
              </ol>
            ) : (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
                <p className="text-sm font-semibold text-ink">Nothing planned for this day yet.</p>
                <p className="mt-1 text-sm text-muted">Add a stop, or let us suggest one.</p>
                {canEdit ? (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button size="sm" onClick={() => setAddingTo(day)} icon="➕">
                      Add activity
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setDiscoverOpen(true)} icon={<Sparkles size={15} />}>
                      Find places
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => generate(day)} icon="✨">
                      Generate day plan
                    </Button>
                  </div>
                ) : null}
              </div>
            )}

            {canEdit && day.activities.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAddingTo(day)} icon="➕">
                  Add activity
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDiscoverOpen(true)} icon={<Sparkles size={15} />}>
                  Find places
                </Button>
              </div>
            ) : null}
          </section>
        ))}

      <DiscoverSheet
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        trip={trip}
        canEdit={canEdit}
        onChanged={onChanged}
      />

      <AddActivitySheet
        trip={trip}
        day={addingTo}
        onClose={() => setAddingTo(null)}
        onSaved={() => {
          setAddingTo(null);
          onChanged();
        }}
      />

      <ActivityDetailSheet
        // Remounts fresh per activity, so any in-progress local state (like an
        // armed "tap again to remove") never carries over to a different one.
        key={detail?.id ?? "none"}
        activity={detail}
        canEdit={canEdit}
        myId={user?.id}
        members={trip.members}
        dayCount={trip.days.length}
        onClose={() => setDetail(null)}
        onRefresh={onChanged}
        onChanged={() => {
          setDetail(null);
          onChanged();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ row */

function ActivityRow({
  activity,
  previous,
  isLast,
  canEdit,
  myId,
  dayCount,
  onOpen,
  onChanged,
}: {
  activity: Activity;
  /** The stop right before this one in the same day, if any — used to show
   *  how far apart they are. */
  previous: Activity | null;
  isLast: boolean;
  canEdit: boolean;
  myId?: number;
  dayCount: number;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { celebrate, toast } = useCelebration();
  const done = activity.status === "completed";

  const hop =
    previous?.latitude != null &&
    previous?.longitude != null &&
    activity.latitude != null &&
    activity.longitude != null
      ? distanceKm(previous.latitude, previous.longitude, activity.latitude, activity.longitude)
      : null;

  async function complete() {
    setBusy(true);
    try {
      // Pinned stops ask the phone where it is; the server checks the 1 km rule.
      celebrate(await completeStop(activity));
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function move(direction: "up" | "down") {
    setBusy(true);
    try {
      await api.post(`/api/activities/${activity.id}/move/`, { direction });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="relative flex gap-3 pb-1">
      {/* Timeline rail */}
      <div className="flex w-6 shrink-0 flex-col items-center pt-3.5">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold",
            done
              ? "border-success bg-success text-white"
              : "border-line bg-surface text-muted",
          )}
          aria-hidden="true"
        >
          {done ? "✓" : "○"}
        </span>
        {!isLast ? <span className="mt-1 w-0.5 flex-1 bg-line" aria-hidden="true" /> : null}
      </div>

      <div className="min-w-0 flex-1 pb-3">
        {hop != null ? (
          <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted">
            <span aria-hidden="true">{hop < 5 ? "🚶" : hop < 15 ? "🚗" : "🛣️"}</span>
            {describeDistance(hop)}
          </p>
        ) : null}
        <div
          className={cn(
            "rounded-xl border p-3 transition-colors",
            done ? "border-line bg-raised" : "border-line bg-surface",
          )}
        >
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-start gap-2.5 text-left"
          >
            <span className="mt-0.5 text-lg" aria-hidden="true">
              {CATEGORY_ICONS[activity.category]}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[15px] font-bold",
                  done ? "text-muted line-through" : "text-ink",
                )}
              >
                {activity.title}
              </span>
              {/* Collapsed view stays to one line of detail. */}
              <span className="mt-0.5 block truncate text-xs text-muted">
                {[
                  activity.place_name,
                  activity.start_time ? clockTime(activity.start_time) : null,
                  `+${activity.xp_value} XP`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {done ? (
              <Chip tone="success">
                <span aria-hidden="true">✓</span> {activity.verified_by_location ? "Been there" : "Done"}
              </Chip>
            ) : activity.assigned_to ? (
              <Chip tone={activity.assigned_to.id === myId ? "brand" : "neutral"}>
                {activity.assigned_to.id === myId ? "Yours" : activity.assigned_to.name.split(" ")[0]}
              </Chip>
            ) : null}
          </button>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {!done && canCompleteStop(activity, myId, canEdit) ? (
              <Button size="sm" onClick={complete} disabled={busy} icon="✓">
                Mark as completed
              </Button>
            ) : null}
            {!done && !canCompleteStop(activity, myId, canEdit) ? (
              <span className="text-xs font-semibold text-muted">
                Assigned to {activity.assigned_to?.name}
              </span>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Details
            </Button>
            {canEdit ? (
              // Drag and drop doesn't work with one thumb, so ordering is
              // done with explicit buttons on every screen size.
              <span className="ml-auto flex gap-1">
                <IconButton
                  label={`Move ${activity.title} up`}
                  onClick={() => move("up")}
                  disabled={busy}
                  className="h-9 w-9 min-h-0 min-w-0 border border-line"
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${activity.title} down`}
                  onClick={() => move("down")}
                  disabled={busy}
                  className="h-9 w-9 min-h-0 min-w-0 border border-line"
                >
                  ↓
                </IconButton>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <span className="sr-only-text">{dayCount} days in this trip</span>
    </li>
  );
}

/* --------------------------------------------------------------- detail */

function ActivityDetailSheet({
  activity,
  canEdit,
  myId,
  members,
  dayCount,
  onClose,
  onChanged,
  onRefresh,
}: {
  activity: Activity | null;
  canEdit: boolean;
  myId?: number;
  members: TripMember[];
  dayCount: number;
  onClose: () => void;
  /** Closes the sheet too — for actions where the activity you were looking
   *  at is now done, removed, or otherwise no longer what's on screen. */
  onChanged: () => void;
  /** Updates the trip data in the background without closing the sheet —
   *  for a field edit, where you're likely about to edit another field. */
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const { celebrate, toast } = useCelebration();

  if (!activity) return null;
  const done = activity.status === "completed";

  /** Every field here autosaves on blur/change, same as the "Visit time"
   *  field below — no separate "Save" button to remember to press. */
  async function autosave(fields: Record<string, unknown>, success = "Saved.") {
    if (!activity) return;
    setBusy(true);
    try {
      await api.patch(`/api/activities/${activity.id}/`, fields);
      toast(success);
      onRefresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<XPResult>, success?: string) {
    setBusy(true);
    try {
      celebrate(await fn());
      if (success) toast(success);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't do that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function assign(userId: string) {
    if (!activity) return;
    setBusy(true);
    try {
      await api.post(`/api/activities/${activity.id}/assign/`, {
        user_id: userId ? Number(userId) : null,
      });
      toast(userId ? "Stop assigned." : "Stop is open to everyone again.");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't assign that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function moveToDay(dayIndex: number) {
    if (!activity) return;
    setBusy(true);
    try {
      await api.post(`/api/activities/${activity.id}/move/`, { day_index: dayIndex });
      toast(`Moved to day ${dayIndex}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!activity) return;
    if (!confirmingRemove) {
      // First tap just arms the button — you have to mean it.
      setConfirmingRemove(true);
      return;
    }
    setBusy(true);
    try {
      await api.del(`/api/activities/${activity.id}/`);
      toast("Removed from the plan.");
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove that.", "error");
      setConfirmingRemove(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={activity.title}
      description={`${CATEGORY_LABELS[activity.category]} · ${timeWindow(activity)}`}
      footer={
        done ? (
          <Button variant="secondary" fullWidth onClick={() => act(() => api.post<XPResult>(`/api/activities/${activity.id}/undo/`), "Marked as not done.")} disabled={busy}>
            Mark as not done
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => act(() => checkInStop(activity))}
              disabled={busy || Boolean(activity.checked_in_at)}
              icon="📍"
            >
              {activity.checked_in_at ? "Checked in" : "Check in"}
            </Button>
            <Button
              fullWidth
              onClick={() => act(() => completeStop(activity))}
              disabled={busy || !canCompleteStop(activity, myId, canEdit)}
              icon="✓"
            >
              Mark as completed
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {activity.description ? (
          <p className="text-[15px] leading-relaxed text-ink">{activity.description}</p>
        ) : null}

        {!done && isPinned(activity) ? (
          <p className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
            <span aria-hidden="true">📍</span> This stop is pinned on the map. Be within 1 km of it to
            check in or mark it complete — we&apos;ll ask for your location.
          </p>
        ) : null}

        {activity.assigned_to ? (
          <p className="text-sm text-muted">
            <span aria-hidden="true">👤</span> Assigned to{" "}
            <b className="text-ink">{activity.assigned_to.id === myId ? "you" : activity.assigned_to.name}</b>
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-3">
          <Detail label="When" value={timeWindow(activity)} />
          <Detail label="Worth" value={`+${activity.xp_value} XP`} />
          {activity.place_name ? <Detail label="Where" value={activity.place_address || activity.place_name} /> : null}
          {activity.place_rating ? <Detail label="Google rating" value={`${activity.place_rating.toFixed(1)} / 5`} /> : null}
          {activity.cost ? <Detail label="Roughly" value={rupees(activity.cost)} /> : null}
        </dl>

        {activity.place_name || activity.latitude ? (
          <a
            href={mapsLink(activity)}
            target="_blank"
            rel="noopener noreferrer"
            className="tap flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink"
          >
            <span aria-hidden="true">🧭</span> Navigate with Google Maps
          </a>
        ) : null}

        {activity.notes ? (
          <div className="rounded-xl bg-raised p-3">
            <p className="text-xs font-semibold text-muted">Notes</p>
            <p className="mt-1 text-sm text-ink">{activity.notes}</p>
          </div>
        ) : null}

        {done && activity.completed_by ? (
          <p className="text-sm text-muted">
            <span aria-hidden="true">✓</span> Completed by {activity.completed_by.name}
            {activity.verified_by_location
              ? " — location confirmed on the spot"
              : isPinned(activity)
                ? " — marked by the organiser"
                : ""}
          </p>
        ) : null}

        {canEdit ? (
          <details className="rounded-xl border border-line bg-surface p-3" open>
            <summary className="cursor-pointer text-sm font-semibold text-ink">Edit this stop</summary>
            <div className="mt-3 space-y-3">
              <TextField
                label="What are you doing?"
                defaultValue={activity.title}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== activity.title) autosave({ title: value }, "Title saved.");
                }}
              />
              <SelectField
                label="Type of activity"
                value={activity.category}
                onChange={(e) => autosave({ category: e.target.value }, "Type saved.")}
                options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                  value,
                  label: `${CATEGORY_ICONS[value as keyof typeof CATEGORY_ICONS]} ${label}`,
                }))}
              />
              <TextAreaField
                label="Anything to remember?"
                defaultValue={activity.description}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value !== activity.description) autosave({ description: value }, "Notes saved.");
                }}
              />
              <TextField
                label="Rough cost (₹)"
                type="number"
                min={0}
                defaultValue={activity.cost || ""}
                onBlur={(e) => {
                  const value = Number(e.target.value) || 0;
                  if (value !== activity.cost) autosave({ cost: value }, "Cost saved.");
                }}
              />

              <SelectField
                label="Assigned to"
                hint="Only this person (or an organiser) can complete the stop."
                value={String(activity.assigned_to?.id ?? "")}
                disabled={busy || done}
                onChange={(e) => assign(e.target.value)}
                options={[
                  { value: "", label: "Anyone on the trip" },
                  ...members.map((m) => ({
                    value: String(m.user.id),
                    label: m.user.id === myId ? `${m.user.name} (you)` : m.user.name,
                  })),
                ]}
              />
              {!done && isPinned(activity) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  disabled={busy}
                  onClick={() =>
                    act(() => completeStop(activity, { override: true }), "Marked complete.")
                  }
                >
                  Mark complete without location (organiser)
                </Button>
              ) : null}
              <TextField
                label="Visit time"
                type="time"
                defaultValue={activity.start_time?.slice(0, 5) ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (activity.start_time?.slice(0, 5) ?? "")) {
                    autosave({ start_time: e.target.value || null }, "Time saved.");
                  }
                }}
              />
              {dayCount > 1 ? (
                <SelectField
                  label="Move to another day"
                  value={String(activity.day_index)}
                  onChange={(e) => moveToDay(Number(e.target.value))}
                  options={Array.from({ length: dayCount }, (_, i) => ({
                    value: String(i + 1),
                    label: `Day ${i + 1}`,
                  }))}
                />
              ) : null}
              <div className="flex gap-2">
                <Button variant="danger" size="sm" fullWidth onClick={remove} disabled={busy}>
                  {confirmingRemove ? "Tap again to confirm" : "Remove this activity"}
                </Button>
                {confirmingRemove ? (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmingRemove(false)} disabled={busy}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-raised p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ add */

function AddActivitySheet({
  trip,
  day,
  onClose,
  onSaved,
}: {
  trip: TripDetail;
  day: Day | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    place_name: "",
    start_time: "",
    description: "",
  });
  const [advanced, setAdvanced] = useState({
    category: "sightseeing",
    end_time: "",
    cost: "",
    xp_value: "20",
    requires_photo: false,
    requires_checkin: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A place picked through Google Search, saved with its coordinates.
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const { toast } = useCelebration();

  if (!day) return null;

  async function save() {
    if (!day) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/days/${day.id}/activities/`, {
        title: form.title.trim(),
        place_name: place?.name ?? form.place_name.trim(),
        ...(place
          ? {
              place_address: place.address,
              google_place_id: place.place_id,
              place_rating: place.rating,
              latitude: place.latitude,
              longitude: place.longitude,
            }
          : {}),
        start_time: form.start_time || null,
        end_time: advanced.end_time || null,
        description: form.description.trim(),
        category: advanced.category,
        cost: Number(advanced.cost) || 0,
        xp_value: Number(advanced.xp_value) || 20,
        requires_photo: advanced.requires_photo,
        requires_checkin: advanced.requires_checkin,
      });
      toast("Added to your plan.");
      setForm({ title: "", place_name: "", start_time: "", description: "" });
      setPlace(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add activity"
      description={`Day ${day.index} · ${shortDate(day.date)}`}
      footer={
        <Button fullWidth size="lg" onClick={save} disabled={busy || !form.title.trim()}>
          {busy ? "Adding…" : "Add activity"}
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {/* The four things everyone fills in. Everything else is folded away. */}
        <TextField
          label="What are you doing?"
          data-autofocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Sunset at Baga Beach"
          required
        />
        <PlaceSearch
          label="Where"
          placeholder="Search a place on Google Maps"
          bias={
            trip.latitude != null && trip.longitude != null
              ? { lat: trip.latitude, lng: trip.longitude, radiusKm: trip.area_radius_km || 15 }
              : null
          }
          onPick={(picked) => {
            setPlace(picked);
            // Use the place's name as the title if nothing has been typed yet.
            setForm((prev) => ({ ...prev, title: prev.title || picked.name }));
          }}
        />
        {place ? (
          <p className="-mt-2 text-xs text-muted">
            Pinned: {place.address}
          </p>
        ) : (
          <SuggestedPlaces
            trip={trip}
            onPick={(picked) => {
              setPlace(picked);
              setForm((prev) => ({ ...prev, title: prev.title || picked.name }));
            }}
          />
        )}
        <TextField
          label="Time"
          type="time"
          value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })}
        />
        <TextAreaField
          label="Anything to remember?"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Reach by 6, parking fills up fast."
        />

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="tap flex w-full items-center justify-between rounded-xl border border-line px-4 text-sm font-semibold text-ink"
        >
          More options
          <span aria-hidden="true">{showAdvanced ? "▲" : "▼"}</span>
        </button>

        {showAdvanced ? (
          <div className="space-y-4 rounded-xl border border-line p-4">
            <SelectField
              label="Type of activity"
              value={advanced.category}
              onChange={(e) => setAdvanced({ ...advanced, category: e.target.value })}
              options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                value,
                label: `${CATEGORY_ICONS[value as keyof typeof CATEGORY_ICONS]} ${label}`,
              }))}
            />
            <TextField
              label="Ends at"
              type="time"
              value={advanced.end_time}
              onChange={(e) => setAdvanced({ ...advanced, end_time: e.target.value })}
            />
            <TextField
              label="Rough cost (₹)"
              type="number"
              min={0}
              value={advanced.cost}
              onChange={(e) => setAdvanced({ ...advanced, cost: e.target.value })}
            />
            <TextField
              label="XP for finishing this"
              type="number"
              min={0}
              value={advanced.xp_value}
              onChange={(e) => setAdvanced({ ...advanced, xp_value: e.target.value })}
            />
            <div className="space-y-2">
              <Toggle
                label="Need a photo before marking done"
                checked={advanced.requires_photo}
                onChange={(v) => setAdvanced({ ...advanced, requires_photo: v })}
              />
              <Toggle
                label="Need to check in at the place"
                checked={advanced.requires_checkin}
                onChange={(v) => setAdvanced({ ...advanced, requires_checkin: v })}
              />
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Popular places for this destination, shown right in the "Add activity" form —
 *  tapping one fills the form exactly like picking a search result does. Hidden
 *  once a place has been picked, so it doesn't compete with the pinned address. */
function SuggestedPlaces({ trip, onPick }: { trip: TripDetail; onPick: (place: PickedPlace) => void }) {
  const where = trip.region && !trip.destination.includes(trip.region) ? `${trip.destination}, ${trip.region}` : trip.destination;
  const bias =
    trip.latitude != null && trip.longitude != null
      ? { lat: trip.latitude, lng: trip.longitude, radiusKm: trip.area_radius_km || 15 }
      : null;
  const { places, loading } = usePlaceSearch(`popular places to visit in ${where}`, { bias, max: 8 });

  if (!loading && places.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted">Popular nearby — tap to fill this in</p>
      <div className="hide-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {loading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-32 shrink-0 rounded-xl" />)
          : places.map((place) => (
              <button
                key={place.place_id}
                type="button"
                onClick={() => onPick(place)}
                className="w-32 shrink-0 overflow-hidden rounded-xl border border-line bg-surface text-left transition-shadow hover:shadow-md"
              >
                <PlacePhoto src={place.photo_url} alt={`Photo of ${place.name}`} rating={place.rating} className="h-20 w-full" />
                <p className="line-clamp-2 px-2 py-1.5 text-xs font-semibold text-ink">{place.name}</p>
              </button>
            ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded border-line accent-[var(--brand)]"
      />
      <span className="text-sm text-ink">{label}</span>
    </label>
  );
}
