"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, LoadingBlock, Progress } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ChecklistItem, TripDetail, UserMini } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The trip checklist. Items with nobody assigned are shared by the group;
 * the rest are one person's. Everyone sees their own list and the shared
 * one; organisers also see — and can add to — every traveller's list.
 */
export function TripChecklist({ trip }: { trip: TripDetail }) {
  const { user } = useAuth();
  const { toast } = useCelebration();
  const { data, loading, error, reload, set } = useApi<ChecklistItem[]>(`/api/trips/${trip.id}/checklist/`);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("me");
  const [busy, setBusy] = useState(false);

  const organiser = trip.my_role === "owner" || trip.my_role === "admin";
  const items = data ?? [];
  const myId = user?.id;
  const mine = items.filter((i) => i.assigned_to?.id === myId);
  const shared = items.filter((i) => !i.assigned_to);
  const others = trip.members.filter((m) => m.user.id !== myId);

  async function toggle(item: ChecklistItem) {
    // Optimistic — ticking a box should feel instant.
    set(items.map((row) => (row.id === item.id ? { ...row, is_done: !row.is_done } : row)));
    try {
      await api.patch(`/api/checklist/${item.id}/`, { is_done: !item.is_done });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update that.", "error");
      reload();
    }
  }

  async function remove(item: ChecklistItem) {
    set(items.filter((row) => row.id !== item.id));
    try {
      await api.del(`/api/checklist/${item.id}/`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove that.", "error");
      reload();
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const body: Record<string, unknown> = { title: title.trim() };
    if (target === "shared") body.assigned_to_id = null;
    else if (target === "everyone") body.for_everyone = true;
    else if (target !== "me") body.assigned_to_id = Number(target);
    try {
      await api.post(`/api/trips/${trip.id}/checklist/`, body);
      setTitle("");
      const who =
        target === "me"
          ? "your list"
          : target === "shared"
            ? "the shared list"
            : target === "everyone"
              ? "everyone's list"
              : `${others.find((m) => String(m.user.id) === target)?.user.name.split(" ")[0]}'s list`;
      toast(`Added to ${who}.`);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add that.", "error");
    } finally {
      setBusy(false);
    }
  }

  const canRemove = (item: ChecklistItem) => organiser || item.assigned_to?.id === myId;

  return (
    <div className="space-y-4">
      {loading && !data ? <LoadingBlock /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}

      <form onSubmit={add} className="card space-y-2.5 p-3.5">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add something to remember"
            aria-label="Add a checklist item"
            className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
          />
          <Button type="submit" disabled={busy || !title.trim()}>
            Add
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          For
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="min-h-[38px] rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
          >
            <option value="me">Just me</option>
            <option value="shared">The whole group (shared)</option>
            {organiser ? (
              <>
                <option value="everyone">Everyone — one each</option>
                {others.map((m) => (
                  <option key={m.user.id} value={String(m.user.id)}>
                    {m.user.name}
                  </option>
                ))}
              </>
            ) : null}
          </select>
        </label>
      </form>

      {!loading && items.length === 0 ? (
        <EmptyState
          emoji="📝"
          title="Nothing on the list yet."
          line={
            organiser
              ? "Add things for yourself, the whole group, or a specific person — like tickets, chargers, ID proofs."
              : "Tickets, chargers, ID proofs — add whatever you don't want to forget."
          }
        />
      ) : null}

      {mine.length ? (
        <ChecklistSection title="My checklist" items={mine} onToggle={toggle} onRemove={remove} canRemove={canRemove} withProgress />
      ) : null}

      {shared.length ? (
        <ChecklistSection
          title="Shared with the group"
          hint="Anyone can tick these off."
          items={shared}
          onToggle={toggle}
          onRemove={remove}
          canRemove={canRemove}
        />
      ) : null}

      {organiser && others.length ? (
        <section aria-labelledby="everyone-heading" className="space-y-2.5">
          <h3 id="everyone-heading" className="text-sm font-bold text-ink">
            Everyone&apos;s checklist <span className="font-normal text-muted">· only organisers see this</span>
          </h3>
          {others.map((m) => (
            <PersonChecklist
              key={m.user.id}
              person={m.user}
              items={items.filter((i) => i.assigned_to?.id === m.user.id)}
              onToggle={toggle}
              onRemove={remove}
              onAdd={() => {
                setTarget(String(m.user.id));
                document.querySelector<HTMLInputElement>('input[aria-label="Add a checklist item"]')?.focus();
              }}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ChecklistSection({
  title,
  hint,
  items,
  onToggle,
  onRemove,
  canRemove,
  withProgress = false,
}: {
  title: string;
  hint?: string;
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
  onRemove: (item: ChecklistItem) => void;
  canRemove: (item: ChecklistItem) => boolean;
  withProgress?: boolean;
}) {
  const done = items.filter((i) => i.is_done).length;
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="text-xs font-semibold text-muted">
          {done}/{items.length} done
        </span>
      </div>
      {hint ? <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p> : null}
      {withProgress ? (
        <div className="mb-2">
          <Progress value={(done / items.length) * 100} size="sm" tone={done === items.length ? "success" : "brand"} />
        </div>
      ) : null}
      <ItemList items={items} onToggle={onToggle} onRemove={onRemove} canRemove={canRemove} />
    </section>
  );
}

/** One traveller's list, as the organiser sees it: progress at a glance,
 *  the items a tap away. */
function PersonChecklist({
  person,
  items,
  onToggle,
  onRemove,
  onAdd,
}: {
  person: UserMini;
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
  onRemove: (item: ChecklistItem) => void;
  onAdd: () => void;
}) {
  const done = items.filter((i) => i.is_done).length;
  const complete = items.length > 0 && done === items.length;
  return (
    <details className="card group p-3.5">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <Avatar user={person} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{person.name}</span>
          {items.length ? (
            <span className="mt-1 block">
              <Progress value={(done / items.length) * 100} size="sm" tone={complete ? "success" : "brand"} />
            </span>
          ) : (
            <span className="block text-xs text-muted">Nothing on their list yet</span>
          )}
        </span>
        {items.length ? (
          <Chip tone={complete ? "success" : "neutral"}>
            {done}/{items.length}
          </Chip>
        ) : null}
        <span className="text-muted transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="mt-3 border-t border-line pt-2">
        {items.length ? <ItemList items={items} onToggle={onToggle} onRemove={onRemove} canRemove={() => true} /> : null}
        <Button size="sm" variant="ghost" className="mt-1" onClick={onAdd}>
          + Add for {person.name.split(" ")[0]}
        </Button>
      </div>
    </details>
  );
}

function ItemList({
  items,
  onToggle,
  onRemove,
  canRemove,
}: {
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
  onRemove: (item: ChecklistItem) => void;
  canRemove: (item: ChecklistItem) => boolean;
}) {
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2">
          <label className="flex min-h-[46px] min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
            <input
              type="checkbox"
              checked={item.is_done}
              onChange={() => onToggle(item)}
              className="h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
            />
            <span className={cn("min-w-0 text-[15px]", item.is_done ? "text-muted line-through" : "text-ink")}>
              {item.title}
            </span>
          </label>
          {canRemove(item) ? (
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="tap flex shrink-0 items-center justify-center rounded-lg text-muted hover:text-danger"
              aria-label={`Remove ${item.title}`}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
