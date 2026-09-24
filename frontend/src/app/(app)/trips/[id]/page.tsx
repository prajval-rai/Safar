"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { TripCover } from "@/components/art/TripCover";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Itinerary } from "@/components/trip/Itinerary";
import { TripChat, TripChecklist, TripExpenses } from "@/components/trip/TripExtras";
import { TripMap } from "@/components/trip/TripMap";
import { TripMemories } from "@/components/trip/TripMemories";
import { TripPeople } from "@/components/trip/TripPeople";
import { Avatar, Chip, ErrorNote, LoadingBlock, Progress, StatTile } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useTripTheme } from "@/lib/tripTheme";
import type { TripDetail, User, XPResult } from "@/lib/types";
import {
  PACE_LABELS,
  TRANSPORT_ICONS,
  TRANSPORT_LABELS,
  TRIP_TYPE_LABELS,
  cn,
  dateRange,
  formatNumber,
  relativeDays,
  rupees,
  shortDate,
  statusBadge,
} from "@/lib/utils";

/** Five everyday tabs. Everything else lives behind "More". */
const MAIN_TABS = [
  { id: "overview", label: "Overview", icon: "📋" },
  { id: "itinerary", label: "Itinerary", icon: "🗓️" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "people", label: "People", icon: "👥" },
  { id: "memories", label: "Memories", icon: "📸" },
] as const;

const MORE_TABS = [
  { id: "expenses", label: "Expenses", icon: "👛" },
  { id: "checklist", label: "Checklist", icon: "📝" },
  { id: "chat", label: "Group chat", icon: "💬" },
  { id: "settings", label: "Trip settings", icon: "⚙️" },
] as const;

type TabId = (typeof MAIN_TABS)[number]["id"] | (typeof MORE_TABS)[number]["id"];

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabId>("overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: trip, loading, error, reload } = useApi<TripDetail>(`/api/trips/${id}/`);
  const { toast } = useCelebration();
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  // While this trip is open, the page wears its destination's colours —
  // restored to your own the moment you leave.
  useTripTheme(trip?.theme);

  // Keep the current view on screen while a refetch runs, so completing an
  // activity doesn't collapse the tab you were on.
  if (loading && !trip) return <LoadingBlock label="Loading your trip…" />;
  if (error && !trip) return <ErrorNote message={error} onRetry={reload} />;
  if (!trip) return null;

  const canEdit = trip.my_role === "owner" || trip.my_role === "admin";
  const badge = statusBadge(trip.status);
  const activeMore = MORE_TABS.find((t) => t.id === tab);

  async function lifecycle(action: "start" | "reopen", message: string) {
    setLifecycleBusy(true);
    try {
      await api.post(`/api/trips/${trip!.id}/${action}/`);
      toast(message);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't do that.", "error");
    } finally {
      setLifecycleBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/trips" className="inline-block text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> My Trips
      </Link>

      <TripCover
        cover={trip.cover_key}
        image={trip.cover_image || undefined}
        alt={`${trip.destination} illustration`}
        className="h-44 w-full sm:h-56 lg:h-64"
      >
        <Chip
          tone={trip.status === "active" ? "success" : "brand"}
          className="mb-2 w-fit bg-white/95"
        >
          <span aria-hidden="true">{badge.mark}</span> {badge.label}
        </Chip>
        <h1 className="text-2xl font-extrabold text-white drop-shadow sm:text-3xl">{trip.title}</h1>
        <p className="text-sm text-white/90 drop-shadow sm:text-base">
          <span aria-hidden="true">📍</span> {trip.destination}
          {trip.region ? `, ${trip.region}` : ""} · {dateRange(trip.start_date, trip.end_date)}
        </p>
      </TripCover>

      {trip.status === "active" ? (
        <ButtonLink href={`/trips/${trip.id}/live`} size="lg" fullWidth icon="🧭">
          Open Live Trip
        </ButtonLink>
      ) : null}

      {trip.status === "planning" && canEdit ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brand/30 bg-brand-soft/40 p-4">
          <div className="min-w-0">
            <p className="font-bold text-ink">Ready to go?</p>
            <p className="text-sm text-muted">Start the trip to switch on Live mode. You can only have one live trip at a time.</p>
          </div>
          <Button size="lg" icon="🚀" onClick={() => lifecycle("start", "Trip started. Have a good one!")} disabled={lifecycleBusy}>
            {lifecycleBusy ? "Starting…" : "Start trip"}
          </Button>
        </div>
      ) : null}

      {trip.status === "cancelled" ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-danger/30 bg-danger-soft/50 p-4">
          <div className="min-w-0">
            <p className="font-bold text-danger">This trip was cancelled</p>
            <p className="text-sm text-muted">Nothing can be ticked off while it&apos;s cancelled.</p>
          </div>
          {canEdit ? (
            <Button variant="secondary" onClick={() => lifecycle("reopen", "Trip reopened.")} disabled={lifecycleBusy}>
              Reopen trip
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Tabs scroll sideways on phones instead of wrapping into a wall. */}
      <div className="hide-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {MAIN_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "flex min-h-[46px] shrink-0 items-center gap-1.5 border-b-2 px-3.5 text-sm font-semibold transition-colors",
              tab === item.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex min-h-[46px] shrink-0 items-center gap-1.5 border-b-2 px-3.5 text-sm font-semibold",
            activeMore ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink",
          )}
        >
          <span aria-hidden="true">⋯</span>
          {activeMore ? activeMore.label : "More"}
        </button>
      </div>

      <div className="animate-rise">
        {tab === "overview" ? <Overview trip={trip} canEdit={canEdit} onGo={setTab} onChanged={reload} /> : null}
        {tab === "itinerary" ? (
          <Itinerary trip={trip} onChanged={reload} canEdit={canEdit} />
        ) : null}
        {tab === "map" ? <TripMap trip={trip} onChanged={reload} canEdit={canEdit} /> : null}
        {tab === "people" ? (
          <TripPeople trip={trip} onChanged={reload} canEdit={canEdit} />
        ) : null}
        {tab === "memories" ? <TripMemories trip={trip} /> : null}
        {tab === "expenses" ? <TripExpenses trip={trip} /> : null}
        {tab === "checklist" ? <TripChecklist trip={trip} /> : null}
        {tab === "chat" ? <TripChat trip={trip} /> : null}
        {tab === "settings" ? <TripSettings trip={trip} onChanged={reload} canEdit={canEdit} /> : null}
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="space-y-2">
          {MORE_TABS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMoreOpen(false);
                }}
                className="flex min-h-[54px] w-full items-center gap-3 rounded-xl border border-line px-4 text-left text-[15px] font-semibold text-ink hover:bg-raised"
              >
                <span className="text-xl" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------- overview */

function Overview({
  trip,
  canEdit,
  onGo,
  onChanged,
}: {
  trip: TripDetail;
  canEdit: boolean;
  onGo: (tab: TabId) => void;
  onChanged: () => void;
}) {
  const nextUp = trip.days
    .flatMap((day) => day.activities.map((a) => ({ ...a, date: day.date })))
    .find((a) => a.status === "planned");

  const completed = trip.days.reduce(
    (sum, day) => sum + day.activities.filter((a) => a.status === "completed").length,
    0,
  );

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <Progress
          value={trip.progress_percent}
          label={`Your trip is ${trip.progress_percent}% complete`}
          tone={trip.status === "completed" ? "success" : "brand"}
        />
        <p className="mt-2 text-sm text-muted">
          {completed} of {trip.activity_count} activities done ·{" "}
          {formatNumber(trip.total_xp)} XP earned so far
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile emoji="📅" value={trip.duration_days} label="Days" />
        <StatTile emoji="📍" value={trip.activity_count} label="Activities" />
        <StatTile emoji="👥" value={trip.member_count} label="Travelling" />
        <StatTile emoji="⭐" value={formatNumber(trip.planned_xp)} label="XP on offer" />
      </div>

      <BudgetCard trip={trip} canEdit={canEdit} onChanged={onChanged} />

      {nextUp ? (
        <section className="card p-4">
          <h2 className="text-sm font-bold text-muted">Next up</h2>
          <p className="mt-1 text-lg font-bold text-ink">{nextUp.title}</p>
          <p className="text-sm text-muted">
            {shortDate(nextUp.date)}
            {nextUp.place_name ? ` · ${nextUp.place_name}` : ""}
          </p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => onGo("itinerary")}>
            See the full plan
          </Button>
        </section>
      ) : null}

      {trip.summary ? (
        <section className="card p-4">
          <h2 className="text-sm font-bold text-muted">About this trip</h2>
          <p className="mt-1 text-[15px] text-ink">{trip.summary}</p>
        </section>
      ) : null}

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold text-muted">Who&apos;s coming</h2>
        <div className="flex flex-wrap items-center gap-2">
          {trip.members.map((member) => (
            <span key={member.id} className="flex items-center gap-2 rounded-full bg-raised py-1 pr-3 pl-1">
              <Avatar user={member.user} size="sm" />
              <span className="text-sm font-semibold text-ink">{member.user.name}</span>
            </span>
          ))}
          {canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => onGo("people")}>
              + Invite
            </Button>
          ) : null}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold text-muted">Trip details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Fact label="Kind of trip" value={TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type} />
          <Fact label="Pace" value={PACE_LABELS[trip.pace] ?? trip.pace} />
          <Fact
            label="Getting around"
            value={`${TRANSPORT_ICONS[trip.transport] ?? ""} ${TRANSPORT_LABELS[trip.transport] ?? trip.transport}`}
          />
          <Fact label="Starts" value={`${shortDate(trip.start_date)} · ${relativeDays(trip.start_date)}`} />
          <Fact label="Organised by" value={trip.created_by.name} />
        </dl>
      </section>
    </div>
  );
}

function BudgetCard({ trip, canEdit, onChanged }: { trip: TripDetail; canEdit: boolean; onChanged: () => void }) {
  const { toast } = useCelebration();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(trip.budget_per_person || 0);
  const [busy, setBusy] = useState(false);
  const total = trip.budget_per_person * trip.member_count;

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/trips/${trip.id}/`, { budget_per_person: amount });
      toast("Budget updated.");
      setOpen(false);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4" aria-labelledby="budget-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="budget-heading" className="text-sm font-bold text-muted">
            Budget
          </h2>
          {trip.budget_per_person ? (
            <>
              <p className="mt-1 text-2xl font-extrabold text-ink">
                {rupees(trip.budget_per_person)} <span className="text-sm font-semibold text-muted">each</span>
              </p>
              <p className="text-sm text-muted">
                About {rupees(total)} for {trip.member_count} {trip.member_count === 1 ? "person" : "people"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[15px] text-ink">No budget yet. Set one to keep spending in check.</p>
          )}
        </div>
        {canEdit ? (
          <Button size="sm" variant={trip.budget_per_person ? "secondary" : "primary"} onClick={() => { setAmount(trip.budget_per_person || 0); setOpen(true); }}>
            {trip.budget_per_person ? "Edit budget" : "Set budget"}
          </Button>
        ) : null}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Trip budget"
        description="How much each person plans to spend."
        footer={
          <Button fullWidth size="lg" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save budget"}
          </Button>
        }
      >
        <TextField
          label="Budget per person (₹)"
          type="number"
          inputMode="numeric"
          min={0}
          data-autofocus
          value={amount || ""}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
          placeholder="e.g. 12000"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {[5000, 10000, 20000, 50000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(v)}
              className="min-h-[40px] rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink hover:bg-raised"
            >
              ₹{v.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
      </Sheet>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-raised p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 font-bold text-ink">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- settings */

function TripSettings({
  trip,
  onChanged,
  canEdit,
}: {
  trip: TripDetail;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { celebrate, toast } = useCelebration();
  const [form, setForm] = useState({
    title: trip.title,
    start_date: trip.start_date,
    end_date: trip.end_date,
    budget_per_person: trip.budget_per_person || 0,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <div className="card p-6 text-center">
          <p className="text-sm text-muted">
            Only the organiser and co-planners can change trip settings.
          </p>
        </div>
        <LeaveTripSection trip={trip} />
      </div>
    );
  }

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/trips/${trip.id}/`, form);
      toast("Trip updated.");
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setPublic(value: boolean) {
    try {
      await api.patch(`/api/trips/${trip.id}/`, { is_public: value });
      toast(value ? "This trip will show on your profile map." : "This trip is now private.");
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change that.", "error");
    }
  }

  async function publishTrack() {
    setBusy(true);
    try {
      const result = await api.post<{ track: { id: string }; xp_awarded: number; user: XPResult["user"] }>(
        "/api/explore/tracks/from-trip/",
        { trip: trip.id },
      );
      celebrate({ user: result.user, xp_awarded: result.xp_awarded });
      router.push(`/explore/${result.track.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't publish that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancelTrip() {
    setBusy(true);
    try {
      await api.post(`/api/trips/${trip.id}/cancel/`);
      toast("Trip cancelled.");
      setConfirmCancel(false);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't cancel that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/trips/${trip.id}/`);
      toast("Trip deleted.");
      router.push("/trips");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete that.", "error");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4">
        <h2 className="text-sm font-bold text-muted">Basics</h2>
        <TextField
          label="Trip name"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Starting"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <TextField
            label="Coming back"
            type="date"
            value={form.end_date}
            min={form.start_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>
        <TextField
          label="Budget per person (₹)"
          type="number"
          inputMode="numeric"
          min={0}
          value={form.budget_per_person || ""}
          onChange={(e) => setForm({ ...form, budget_per_person: Math.max(0, Number(e.target.value) || 0) })}
          placeholder="e.g. 12000"
        />
        <Button onClick={save} disabled={busy}>
          Save changes
        </Button>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-muted">Who can see this trip</h2>
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            defaultChecked={trip.is_public}
            onChange={(e) => void setPublic(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
          />
          <span>
            <span className="block text-[15px] font-semibold text-ink">Show on my public profile</span>
            <span className="block text-sm text-muted">
              Once it&apos;s finished, its area and the places you actually visited appear on your
              profile map for anyone who follows you. Turn this off to keep the trip private.
            </span>
          </span>
        </label>
      </section>

      {trip.status === "completed" ? (
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-bold text-muted">Trip status</h2>
          <p className="text-sm text-muted">
            This trip finished because every stop on the itinerary was completed.
          </p>
          <ButtonLink href={`/trips/${trip.id}/complete`} variant="secondary" fullWidth icon="🏆">
            See your trip story
          </ButtonLink>
        </section>
      ) : null}

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-muted">Share this journey</h2>
        <p className="text-sm text-muted">
          Turn your journey into a track others can follow. Worth +10 XP.
        </p>
        <Button variant="accent" fullWidth icon="🧭" onClick={publishTrack} disabled={busy}>
          Publish as a track
        </Button>
      </section>

      {trip.status === "planning" || trip.status === "active" ? (
        <section className="card space-y-3 border-danger/25 p-4">
          <h2 className="text-sm font-bold text-danger">Cancel this trip</h2>
          <p className="text-sm text-muted">
            Calling it off keeps the plan and any XP already earned for real stops, but nothing can be
            ticked off until you reopen it.
            {trip.status === "active"
              ? " Since this trip is already under way, cancelling it now costs the organiser some XP — cancelling one that's still in planning is free. It also frees you to start another trip."
              : ""}
          </p>
          <Button variant="danger" fullWidth onClick={() => setConfirmCancel(true)} disabled={busy}>
            Cancel trip
          </Button>
        </section>
      ) : null}

      <LeaveTripSection trip={trip} />

      {trip.my_role === "owner" ? (
        <section className="card space-y-3 border-danger/25 p-4">
          <h2 className="text-sm font-bold text-danger">Danger zone</h2>
          <p className="text-sm text-muted">
            Deleting removes the itinerary, expenses and memories for everyone on the trip.
          </p>
          <Button variant="danger" fullWidth onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete this trip
          </Button>
        </section>
      ) : null}

      <Sheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this trip?"
        description="You can reopen it later."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirmCancel(false)}>
              Keep going
            </Button>
            <Button variant="danger" fullWidth onClick={cancelTrip} disabled={busy}>
              Cancel trip
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          <b className="text-ink">{trip.title}</b> will be marked as cancelled for all {trip.member_count} travellers.
        </p>
        {trip.status === "active" ? (
          <p className="mt-2 text-sm text-danger">
            <span aria-hidden="true">⚠️</span> This trip has already started, so cancelling it now costs
            you some XP.
          </p>
        ) : null}
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this trip?"
        description="This can't be undone."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" fullWidth onClick={remove} disabled={busy}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          <b className="text-ink">{trip.title}</b> and everything in it will be removed for all{" "}
          {trip.member_count} travellers.
        </p>
      </Sheet>
    </div>
  );
}

/** "Leave trip" for anyone who joined (not the owner). The pop-up spells out
 *  exactly what happens — including the XP it costs — before anything does. */
function LeaveTripSection({ trip }: { trip: TripDetail }) {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { toast } = useCelebration();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (trip.leave_penalty === null) return null;
  const cost = Math.abs(trip.leave_penalty);
  const live = trip.status === "active";
  const xpNow = user?.xp ?? 0;

  async function leave() {
    setBusy(true);
    try {
      const result = await api.post<{ user: User; xp_penalty: number }>(`/api/trips/${trip.id}/leave/`);
      setUser(result.user);
      toast(result.xp_penalty ? `You left ${trip.title} · ${result.xp_penalty} XP` : `You left ${trip.title}.`);
      router.push("/trips");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't leave the trip.", "error");
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card space-y-3 border-danger/25 p-4">
        <h2 className="text-sm font-bold text-danger">Leave this trip</h2>
        <p className="text-sm text-muted">
          Can&apos;t make it any more? You can step off the trip.
          {cost ? ` It costs ${cost} XP.` : " It's free, since this trip was cancelled."}
        </p>
        <Button variant="danger" fullWidth icon="🚪" onClick={() => setOpen(true)}>
          Leave trip
        </Button>
      </section>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Leave ${trip.title}?`}
        description="Here's what happens if you leave."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Stay on the trip
            </Button>
            <Button variant="danger" fullWidth onClick={leave} disabled={busy}>
              {busy ? "Leaving…" : cost ? `Leave (−${cost} XP)` : "Leave"}
            </Button>
          </div>
        }
      >
        {cost ? (
          <div className="rounded-2xl bg-danger-soft p-4 text-center">
            <p className="text-3xl font-extrabold text-danger">−{cost} XP</p>
            <p className="mt-1 text-sm text-danger">
              {live ? "This trip is already under way." : "This trip hasn't started yet."} Your total goes from{" "}
              <b>{xpNow}</b> to <b>{Math.max(0, xpNow - cost)}</b> XP.
            </p>
          </div>
        ) : null}
        <ul className="mt-4 space-y-2.5 text-sm text-ink">
          <li className="flex gap-2.5">
            <span aria-hidden="true">🔒</span>
            You&apos;ll lose access to the plan, group chat, expenses and memories.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true">✅</span>
            XP you&apos;ve already earned on this trip stays yours.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true">📣</span>
            The organiser, {trip.created_by.name}, will be told you left, and any stops you were looking
            after go back to the group.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true">🎟️</span>
            You can rejoin later with the invite code, but the XP isn&apos;t given back.
          </li>
        </ul>
      </Sheet>
    </>
  );
}
