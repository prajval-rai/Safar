"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DestinationPicker } from "@/components/maps/DestinationPicker";
import { DiscoverPlaces, InterestPicker } from "@/components/maps/DiscoverPlaces";
import { GoogleMap, type MapPin } from "@/components/maps/GoogleMap";
import { usePlaceActions } from "@/components/maps/usePlaceActions";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Itinerary } from "@/components/trip/Itinerary";
import { Avatar, Chip, Progress } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChoiceCard, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { TYPE_INTERESTS } from "@/lib/interests";
import { coverFor } from "@/lib/places";
import type { CoverKey, PickedPlace, TripDetail, TripTypeDefault, UserMini } from "@/lib/types";
import {
  PACE_LABELS,
  TRANSPORT_ICONS,
  TRANSPORT_LABELS,
  TRIP_TYPE_LABELS,
  addDays,
  cn,
  daysBetween,
  shortDate,
  todayISO,
} from "@/lib/utils";

const TOTAL_STEPS = 6;

const TRIP_TYPES: { id: string; emoji: string }[] = [
  { id: "friends", emoji: "🎒" },
  { id: "family", emoji: "👨‍👩‍👧" },
  { id: "couple", emoji: "💛" },
  { id: "solo", emoji: "🚶" },
  { id: "weekend", emoji: "🌤️" },
  { id: "road", emoji: "🛣️" },
  { id: "college", emoji: "🎓" },
  { id: "office", emoji: "💼" },
  { id: "adventure", emoji: "🪂" },
  { id: "pilgrimage", emoji: "🛕" },
];

interface Draft {
  destination: string;
  region: string;
  /** Straight from Google when the destination is picked. */
  address: string;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string;
  area_radius_km: number;
  interests: string[];
  /** Ideal length for the chosen place, when we know one. */
  suggested_days: number;
  cover_key: CoverKey;
  title: string;
  summary: string;
  start_date: string;
  end_date: string;
  trip_type: string;
  pace: "relaxed" | "balanced" | "packed";
  transport: string;
  budget_per_person: number;
  is_public: boolean;
  invite_usernames: string[];
}

export default function NewTripPage() {
  const router = useRouter();
  const { toast } = useCelebration();
  const [step, setStep] = useState(1);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>({
    destination: "",
    region: "",
    address: "",
    latitude: null,
    longitude: null,
    google_place_id: "",
    area_radius_km: 0,
    interests: TYPE_INTERESTS.friends,
    suggested_days: 0,
    cover_key: "mountain",
    title: "",
    summary: "",
    start_date: "",
    end_date: "",
    trip_type: "friends",
    pace: "balanced",
    transport: "mixed",
    budget_per_person: 0,
    is_public: false,
    invite_usernames: [],
  });

  const catalog = useApi<{ trip_types: Record<string, TripTypeDefault> }>("/api/catalog/");

  function patch(changes: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...changes }));
  }

  /** Coordinates, address and area size all come from Google's response. */
  function pickDestination(place: PickedPlace, region: string, themeId: string) {
    setDraft((prev) => ({
      ...prev,
      destination: place.name,
      region: region || prev.region,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      google_place_id: place.place_id,
      area_radius_km: place.radius_km,
      cover_key: coverFor(place.types, themeId),
      title: prev.title || `${place.name} trip`,
    }));
    // If we know this place well, suggest a length and way of getting there.
    api
      .get<{ suggested_days?: number; transport?: string }>(
        `/api/catalog/defaults/?destination=${encodeURIComponent(place.name)}&trip_type=${draft.trip_type}`,
      )
      .then((defaults) => {
        if (defaults.suggested_days) {
          patch({ suggested_days: defaults.suggested_days, transport: defaults.transport ?? "mixed" });
        }
      })
      .catch(() => {});
  }

  async function createTrip() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<TripDetail>("/api/trips/", {
        ...draft,
        title: draft.title.trim() || `${draft.destination} trip`,
      });
      setTrip(created);
      setStep(5);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the trip.");
    } finally {
      setBusy(false);
    }
  }

  const canContinue = useMemo(() => {
    if (step === 1) return draft.destination.trim().length > 1;
    if (step === 2) return Boolean(draft.start_date && draft.end_date);
    return true;
  }, [step, draft]);

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/trips" className="text-sm font-semibold text-muted hover:text-ink">
          <span aria-hidden="true">←</span> Cancel
        </Link>
        <span className="text-sm font-semibold text-muted">
          Step {step} of {TOTAL_STEPS}
        </span>
      </div>

      <Progress value={(step / TOTAL_STEPS) * 100} size="sm" />

      <div className="mt-6">
        {error ? (
          <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <section>
            <StepHeading
              title="Where are you going?"
              line="Search for a place, or browse popular destinations by state."
            />
            <DestinationPicker
              value={draft}
              onPick={pickDestination}
              onManual={(name) =>
                patch({
                  destination: name,
                  address: "",
                  latitude: null,
                  longitude: null,
                  google_place_id: "",
                  area_radius_km: 0,
                })
              }
            />
          </section>
        ) : null}
        {step === 2 ? (
          <StepWhen draft={draft} patch={patch} typeDefaults={catalog.data?.trip_types} />
        ) : null}
        {step === 3 ? <StepWho draft={draft} patch={patch} /> : null}
        {step === 4 ? (
          <StepKind draft={draft} patch={patch} typeDefaults={catalog.data?.trip_types} />
        ) : null}
        {step === 5 && trip ? <StepItinerary trip={trip} onUpdate={setTrip} /> : null}
        {step === 6 && trip ? <StepInvite trip={trip} /> : null}
      </div>

      {/* One sticky action bar — the next step is never hidden below the fold. */}
      <div
        className="sticky bottom-0 -mx-4 mt-7 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      >
        <div className="flex gap-3">
          {step > 1 && step < 5 ? (
            <Button variant="secondary" size="lg" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}

          {step < 4 ? (
            <Button size="lg" fullWidth disabled={!canContinue} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : null}

          {step === 4 ? (
            <Button size="lg" fullWidth disabled={busy} onClick={createTrip}>
              {busy ? "Creating…" : "Create trip"}
            </Button>
          ) : null}

          {step === 5 ? (
            <Button size="lg" fullWidth onClick={() => setStep(6)}>
              Next: invite friends
            </Button>
          ) : null}

          {step === 6 && trip ? (
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                toast("Trip ready. Have a good one!");
                router.push(`/trips/${trip.id}`);
              }}
            >
              Done — open my trip
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- step 2 */

function StepWhen({
  draft,
  patch,
  typeDefaults,
}: {
  draft: Draft;
  patch: (changes: Partial<Draft>) => void;
  typeDefaults?: Record<string, TripTypeDefault>;
}) {
  const suggestedDays = draft.suggested_days || typeDefaults?.[draft.trip_type]?.days || 3;

  // Choosing a start date fills in a sensible end date, which is still editable.
  function setStart(value: string) {
    const end =
      draft.end_date && draft.end_date >= value ? draft.end_date : addDays(value, suggestedDays - 1);
    patch({ start_date: value, end_date: end });
  }

  const nights = draft.start_date && draft.end_date ? daysBetween(draft.start_date, draft.end_date) : 0;

  // "How many days?" moves the return date, so it always matches the calendar.
  function setDayCount(count: number) {
    if (!draft.start_date) return;
    patch({ end_date: addDays(draft.start_date, Math.min(60, Math.max(1, count)) - 1) });
  }

  const quickPicks = [
    { label: "This weekend", start: nextWeekend(0) },
    { label: "Next weekend", start: nextWeekend(7) },
    { label: "Next month", start: addDays(todayISO(), 30) },
  ];

  return (
    <section>
      <StepHeading title="When?" line="You can change the dates later." />

      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5">
        <div>
          <p className="text-sm font-semibold text-ink">How many days?</p>
          <p className="text-xs text-muted">
            {draft.start_date
              ? draft.suggested_days
                ? `${draft.suggested_days} days works well for ${draft.destination}.`
                : "Change it any time."
              : "Pick a start date first."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDayCount(nights - 1)}
            disabled={!draft.start_date || nights <= 1}
            aria-label="One day fewer"
            className="tap flex items-center justify-center rounded-xl border border-line text-xl font-semibold text-ink hover:bg-raised disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[4.5rem] text-center text-base font-bold text-ink" aria-live="polite">
            {nights || suggestedDays} {(nights || suggestedDays) === 1 ? "Day" : "Days"}
          </span>
          <button
            type="button"
            onClick={() => setDayCount(nights + 1)}
            disabled={!draft.start_date || nights >= 60}
            aria-label="One day more"
            className="tap flex items-center justify-center rounded-xl border border-line text-xl font-semibold text-ink hover:bg-raised disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {quickPicks.map((pick) => (
          <button
            key={pick.label}
            type="button"
            onClick={() => setStart(pick.start)}
            className={cn(
              "tap rounded-full border px-4 text-sm font-semibold transition-colors",
              draft.start_date === pick.start
                ? "border-brand bg-brand-soft text-brand"
                : "border-line bg-surface text-ink hover:bg-raised",
            )}
          >
            {pick.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Starting"
          type="date"
          value={draft.start_date}
          min={todayISO()}
          onChange={(e) => setStart(e.target.value)}
          required
        />
        <TextField
          label="Coming back"
          type="date"
          value={draft.end_date}
          min={draft.start_date || todayISO()}
          onChange={(e) => patch({ end_date: e.target.value })}
          required
        />
      </div>

      {nights > 0 ? (
        <p className="mt-4 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-brand">
          {nights} {nights === 1 ? "day" : "days"} · {shortDate(draft.start_date)} to{" "}
          {shortDate(draft.end_date)}
        </p>
      ) : null}
    </section>
  );
}

function nextWeekend(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const untilSaturday = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + untilSaturday);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- step 3 */

function StepWho({ draft, patch }: { draft: Draft; patch: (changes: Partial<Draft>) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserMini[]>([]);

  // Debounced so we aren't firing a request on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const needle = query.trim();
      if (needle.length < 2) {
        setResults([]);
        return;
      }
      api
        .get<UserMini[]>(`/api/users/search/?q=${encodeURIComponent(needle)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  function toggle(username: string) {
    const has = draft.invite_usernames.includes(username);
    patch({
      invite_usernames: has
        ? draft.invite_usernames.filter((u) => u !== username)
        : [...draft.invite_usernames, username],
    });
  }

  return (
    <section>
      <StepHeading
        title="Who's coming, and what's the budget?"
        line="Add people now or skip — you can add them later. You can change the budget any time."
      />

      <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
        <TextField
          label="Budget per person (₹)"
          hint="Optional. It helps you spot overspending later."
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.budget_per_person || ""}
          onChange={(e) => patch({ budget_per_person: Math.max(0, Number(e.target.value) || 0) })}
          placeholder="e.g. 12000"
        />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick budgets">
          {[5000, 10000, 20000, 50000].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => patch({ budget_per_person: amount })}
              aria-pressed={draft.budget_per_person === amount}
              className={cn(
                "min-h-[40px] rounded-full border px-3.5 text-sm font-semibold",
                draft.budget_per_person === amount
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line bg-surface text-ink hover:bg-raised",
              )}
            >
              ₹{amount.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        {draft.budget_per_person ? (
          <p className="mt-3 text-sm text-muted">
            About{" "}
            <strong className="text-ink">
              ₹{(draft.budget_per_person * (1 + draft.invite_usernames.length)).toLocaleString("en-IN")}
            </strong>{" "}
            for {1 + draft.invite_usernames.length} {draft.invite_usernames.length ? "people" : "person"}.
          </p>
        ) : null}
      </div>

      <TextField
        label="Search travellers"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a username"
        autoComplete="off"
      />

      {draft.invite_usernames.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {draft.invite_usernames.map((username) => (
            <button
              key={username}
              type="button"
              onClick={() => toggle(username)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand"
            >
              {username}
              <span aria-hidden="true">✕</span>
              <span className="sr-only-text">Remove {username}</span>
            </button>
          ))}
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {results.map((person) => {
          const added = draft.invite_usernames.includes(person.username);
          return (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => toggle(person.username)}
                aria-pressed={added}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  added ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-raised",
                )}
              >
                <Avatar user={person} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{person.name}</span>
                  <span className="block truncate text-xs text-muted">@{person.username}</span>
                </span>
                <span className="text-sm font-semibold text-brand">{added ? "Added" : "Add"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {query.trim().length >= 2 && results.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nobody by that name yet. You can still share the invite code after creating the trip.
        </p>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- step 4 */

function StepKind({
  draft,
  patch,
  typeDefaults,
}: {
  draft: Draft;
  patch: (changes: Partial<Draft>) => void;
  typeDefaults?: Record<string, TripTypeDefault>;
}) {
  const [showMore, setShowMore] = useState(false);
  const hint = typeDefaults?.[draft.trip_type]?.hint;

  // Picking a kind quietly applies sensible pace and transport defaults.
  function chooseType(id: string) {
    const defaults = typeDefaults?.[id];
    // Swap in the new kind's usual interests, but never overwrite ones the
    // traveller has picked themselves.
    const previous = TYPE_INTERESTS[draft.trip_type] ?? [];
    const untouched =
      draft.interests.length === 0 ||
      (draft.interests.length === previous.length &&
        previous.every((i) => draft.interests.includes(i)));
    patch({
      trip_type: id,
      ...(untouched ? { interests: TYPE_INTERESTS[id] ?? [] } : {}),
      ...(defaults ? { pace: defaults.pace, transport: defaults.transport } : {}),
    });
  }

  return (
    <section>
      <StepHeading title="What kind of trip?" line="This sets the pace of your plan." />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TRIP_TYPES.map((type) => {
          const selected = draft.trip_type === type.id;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => chooseType(type.id)}
              aria-pressed={selected}
              className={cn(
                "flex min-h-[86px] flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition-colors",
                selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-raised",
              )}
            >
              <span className="text-2xl" aria-hidden="true">
                {type.emoji}
              </span>
              <span className="text-xs font-semibold text-ink">
                {TRIP_TYPE_LABELS[type.id] ?? type.id}
              </span>
            </button>
          );
        })}
      </div>

      {hint ? (
        <p className="mt-3 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          <span aria-hidden="true">💡</span> {hint}
        </p>
      ) : null}

      <div className="mt-6">
        <InterestPicker value={draft.interests} onChange={(interests) => patch({ interests })} />
        <p className="mt-2 text-xs text-muted">
          We&apos;ll use these to suggest popular places in {draft.destination || "your destination"}.
        </p>
      </div>

      {/* Everything advanced stays folded away until asked for. */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="tap flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink"
        >
          More options
          <span aria-hidden="true">{showMore ? "▲" : "▼"}</span>
        </button>

        {showMore ? (
          <div className="mt-3 space-y-4 rounded-xl border border-line bg-surface p-4">
            <TextField
              label="Trip name"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={`${draft.destination || "Our"} trip`}
            />
            <TextAreaField
              label="One line about it"
              value={draft.summary}
              onChange={(e) => patch({ summary: e.target.value })}
              placeholder="Beaches, shacks and one very early sunrise."
            />
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">How packed should the days be?</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["relaxed", "balanced", "packed"] as const).map((pace) => (
                  <ChoiceCard
                    key={pace}
                    name="pace"
                    selected={draft.pace === pace}
                    title={PACE_LABELS[pace]}
                    subtitle={
                      pace === "relaxed"
                        ? "4 things a day"
                        : pace === "balanced"
                          ? "5 things a day"
                          : "7 things a day"
                    }
                    onSelect={() => patch({ pace })}
                  />
                ))}
              </div>
            </div>
            <SelectField
              label="Getting around"
              value={draft.transport}
              onChange={(e) => patch({ transport: e.target.value })}
              options={Object.entries(TRANSPORT_LABELS).map(([value, label]) => ({
                value,
                label: `${TRANSPORT_ICONS[value]} ${label}`,
              }))}
            />
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={draft.is_public}
                onChange={(e) => patch({ is_public: e.target.checked })}
                className="mt-1 h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Show on my public profile</span>
                <span className="block text-xs text-muted">
                  When the trip is finished, followers can see the area you covered on your profile map.
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- step 5 */

function StepItinerary({
  trip,
  onUpdate,
}: {
  trip: TripDetail;
  onUpdate: (trip: TripDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useCelebration();

  // After every add/remove, re-read the trip so "Added · Day 2" stays truthful.
  const refresh = async () => onUpdate(await api.get<TripDetail>(`/api/trips/${trip.id}/`));
  const { interests, changeInterests, add, remove, added } = usePlaceActions(trip, true, refresh);

  const pins = useMemo<MapPin[]>(
    () =>
      trip.days
        .flatMap((day) => day.activities)
        .flatMap((a, index) =>
          a.latitude != null && a.longitude != null
            ? [{ id: a.id, lat: a.latitude, lng: a.longitude, label: String(index + 1), title: a.title }]
            : [],
        ),
    [trip.days],
  );

  async function generate() {
    setBusy(true);
    try {
      const result = await api.post<{ created: number; trip: TripDetail }>(
        `/api/trips/${trip.id}/generate-plan/`,
        { replace: false },
      );
      onUpdate(result.trip);
      toast(
        result.created
          ? `Added ${result.created} activities — edit anything you like.`
          : "Your days already have places — we left them as they are.",
      );
    } catch {
      toast("Couldn't build a plan just now.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <StepHeading
        title="Pick places for your trip"
        line={`Tap "Add to trip" on anything that looks good in ${trip.destination}. We'll spread them across your days.`}
      />

      <DiscoverPlaces
        destination={trip.destination}
        region={trip.region}
        lat={trip.latitude}
        lng={trip.longitude}
        radiusKm={trip.area_radius_km}
        interests={interests}
        onInterestsChange={changeInterests}
        added={added}
        dayCount={trip.days.length}
        canAdd
        onAdd={add}
        onRemove={remove}
        excludeId={trip.google_place_id}
      />

      {pins.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-ink">Your places so far</p>
          <GoogleMap
            className="h-56"
            ariaLabel={`Places added to your ${trip.destination} trip`}
            center={
              trip.latitude != null && trip.longitude != null
                ? { lat: trip.latitude, lng: trip.longitude }
                : null
            }
            radiusKm={trip.area_radius_km}
            pins={pins}
          />
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        <p className="text-sm font-semibold text-ink">Prefer a ready-made plan?</p>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left hover:bg-raised disabled:opacity-60"
        >
          <span className="text-2xl" aria-hidden="true">
            ✨
          </span>
          <span>
            <span className="block text-[15px] font-bold text-ink">
              {busy ? "Building your plan…" : "Generate a day plan"}
            </span>
            <span className="block text-sm text-muted">
              Fills any empty days with a suggested plan. Days that already have places are left
              alone.
            </span>
          </span>
        </button>
      </div>

      <div className="mt-8">
        <p className="mb-1 text-base font-bold text-ink">Your day-by-day plan</p>
        <p className="mb-3 text-sm text-muted">
          Pick a day, set a time for each stop, and reorder as you like — exactly what you&apos;ll
          use once the trip is under way. We&apos;ll flag stops that are a real hop from the one
          before it.
        </p>
        <Itinerary trip={trip} onChanged={refresh} canEdit />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- step 6 */

function StepInvite({ trip }: { trip: TripDetail }) {
  const { toast } = useCelebration();

  const shareText = `Join my trip "${trip.title}" on Safar. Invite code: ${trip.join_code}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.title, text: shareText });
        return;
      } catch {
        /* the traveller dismissed the share sheet — nothing to do */
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast("Invite copied — paste it in your group.");
    } catch {
      toast("Copy the code above and share it.", "error");
    }
  }

  return (
    <section>
      <StepHeading title="Invite your people" line="Share this code — they'll land straight in the trip." />

      <div className="card flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-sm font-semibold text-muted">Invite code</p>
        <p className="text-3xl font-extrabold tracking-[0.35em] text-brand">{trip.join_code}</p>
        <Button variant="secondary" icon="🔗" onClick={share} className="mt-2">
          Share invite
        </Button>
      </div>

      {trip.members.length > 1 ? (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-ink">Already on board</p>
          <div className="flex flex-wrap gap-2">
            {trip.members.map((member) => (
              <Chip key={member.id} tone="brand">
                <span aria-hidden="true">{member.user.avatar_emoji}</span> {member.user.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 text-center">
        <ButtonLink href={`/trips/${trip.id}`} variant="ghost" size="sm">
          Skip for now
        </ButtonLink>
      </div>
    </section>
  );
}

function StepHeading({ title, line }: { title: string; line: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{line}</p>
    </div>
  );
}
