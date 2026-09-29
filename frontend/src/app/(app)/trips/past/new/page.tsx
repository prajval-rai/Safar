"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DestinationPicker } from "@/components/maps/DestinationPicker";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { coverFor } from "@/lib/places";
import type { CoverKey, PastTripConfig, PickedPlace, TripDetail } from "@/lib/types";
import { TRANSPORT_LABELS, TRIP_TYPE_LABELS, formatNumber } from "@/lib/utils";

interface Draft {
  destination: string;
  region: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string;
  area_radius_km: number;
  cover_key: CoverKey;
  title: string;
  summary: string;
  start_date: string;
  end_date: string;
  trip_type: string;
  transport: string;
  budget_per_person: number;
  /** Show it on my profile map once approved. */
  is_public: boolean;
}

/** yyyy-mm-dd for a date `daysAgo` days before today, in local time. */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * "I've already been": log a trip that's over. This page sets up the basics;
 * the trip page then takes the itinerary, the photos (the proof an admin
 * looks at) and the story, and sends it for review.
 */
export default function LogPastTripPage() {
  const router = useRouter();
  const { toast } = useCelebration();
  const { data: config, loading, error, reload } = useApi<PastTripConfig>("/api/past-trips/config/");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft>({
    destination: "",
    region: "",
    address: "",
    latitude: null,
    longitude: null,
    google_place_id: "",
    area_radius_km: 0,
    cover_key: "mountain",
    title: "",
    summary: "",
    start_date: "",
    end_date: "",
    trip_type: "friends",
    transport: "mixed",
    budget_per_person: 0,
    is_public: true,
  });

  function patch(changes: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...changes }));
  }

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
  }

  if (loading && !config) return <LoadingBlock label="Loading…" />;
  if (error && !config) return <ErrorNote message={error} onRetry={reload} />;
  if (!config) return null;

  if (!config.enabled) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <span className="text-5xl" aria-hidden="true">
          🕰️
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-ink">Past trips are paused</h1>
        <p className="mt-1 text-sm text-muted">Logging trips you&apos;ve already been on isn&apos;t open right now. Check back soon.</p>
        <Link href="/trips" className="mt-4 inline-block text-sm font-semibold text-brand">
          Back to My Trips
        </Link>
      </div>
    );
  }

  const yesterday = isoDaysAgo(1);
  const earliest = isoDaysAgo(config.max_age_days + 60);
  const ready =
    draft.destination.trim() && draft.title.trim() && draft.start_date && draft.end_date && draft.end_date >= draft.start_date;
  const xpOnApproval = Number(config.approval_xp) + Number(config.story_xp);

  async function create() {
    setBusy(true);
    setErrors({});
    try {
      const trip = await api.post<TripDetail>("/api/trips/", { ...draft, is_past: true });
      toast("Saved as a draft — now add your stops and photos.");
      router.push(`/trips/${trip.id}?tab=overview`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        toast(err.message, "error");
      } else {
        toast("Couldn't save that.", "error");
      }
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <Link href="/trips" className="inline-block text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> My Trips
      </Link>

      <header>
        <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Log a trip you&apos;ve been on</h1>
        <p className="mt-1 text-sm text-muted">
          Already been somewhere? Add it with its itinerary, photos and story. An admin checks it, and once
          it&apos;s approved it counts like any trip you&apos;ve finished.
        </p>
      </header>

      <ol className="card grid gap-3 p-4 text-sm sm:grid-cols-2" aria-label="How it works">
        <HowStep n={1} title="Where and when" line="The place and your dates — this page." />
        <HowStep n={2} title="Your itinerary" line={`Day by day, what you did — at least ${config.min_stops} stop${config.min_stops === 1 ? "" : "s"}.`} />
        <HowStep
          n={3}
          title="Photos from the trip"
          line={`At least ${config.min_photos} — they're what the admin checks. Up to ${config.max_photos}.`}
        />
        <HowStep
          n={4}
          title={config.require_story ? "Your story" : "Your story (optional)"}
          line={
            config.allow_public_story
              ? "Write about it and choose whether it's shared to the Feed."
              : "Write about it — it stays on the trip."
          }
        />
        <HowStep
          n={5}
          title="Send for review"
          line={
            xpOnApproval > 0
              ? `Every admin is notified. Approved trips earn up to +${formatNumber(xpOnApproval)} XP.`
              : "Every admin is notified, and you hear back once it's reviewed."
          }
        />
      </ol>

      <section className="card space-y-3 p-4">
        <h2 className="text-lg font-extrabold text-ink">Where did you go?</h2>
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
        {errors.destination ? <p className="text-sm text-danger">{errors.destination}</p> : null}
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="text-lg font-extrabold text-ink">The trip</h2>
        <TextField
          label="Trip name"
          value={draft.title}
          error={errors.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Manali with college friends"
          maxLength={120}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Started"
            type="date"
            value={draft.start_date}
            min={earliest}
            max={yesterday}
            error={errors.start_date}
            onChange={(e) => patch({ start_date: e.target.value, end_date: draft.end_date || e.target.value })}
          />
          <TextField
            label="Came back"
            type="date"
            value={draft.end_date}
            min={draft.start_date || earliest}
            max={yesterday}
            error={errors.end_date}
            hint={`It must have ended before today, and within the last ${formatNumber(config.max_age_days)} days.`}
            onChange={(e) => patch({ end_date: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Kind of trip"
            value={draft.trip_type}
            onChange={(e) => patch({ trip_type: e.target.value })}
            options={Object.entries(TRIP_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <SelectField
            label="Getting around"
            value={draft.transport}
            onChange={(e) => patch({ transport: e.target.value })}
            options={Object.entries(TRANSPORT_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <TextField
          label="Roughly what it cost per person (₹)"
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.budget_per_person || ""}
          onChange={(e) => patch({ budget_per_person: Math.max(0, Number(e.target.value) || 0) })}
          placeholder="Optional"
        />
        <TextAreaField
          label="One line about it"
          value={draft.summary}
          maxLength={240}
          onChange={(e) => patch({ summary: e.target.value })}
          placeholder="Optional — snow, maggi and a very cold bus ride."
          rows={2}
        />
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={draft.is_public}
            onChange={(e) => patch({ is_public: e.target.checked })}
            className="mt-1 h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
          />
          <span>
            <span className="block text-[15px] font-semibold text-ink">Show this trip on my profile map</span>
            <span className="block text-sm text-muted">
              Once it&apos;s approved, its area appears on your public profile map. You can change this later in the
              trip&apos;s settings.
            </span>
          </span>
        </label>
      </section>

      {/* One sticky action bar, like the plan-a-trip wizard. */}
      <div
        className="sticky bottom-0 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-sm text-muted sm:block">Saved as a draft — nothing is sent until you submit it.</p>
          <Button size="lg" icon="🕰️" onClick={create} disabled={busy || !ready} className="w-full sm:w-auto">
            {busy ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HowStep({ n, title, line }: { n: number; title: string; line: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">
        {n}
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-ink">{title}</span>
        <span className="block text-muted">{line}</span>
      </span>
    </li>
  );
}
