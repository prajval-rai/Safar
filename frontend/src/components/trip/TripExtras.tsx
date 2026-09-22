"use client";

import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, LoadingBlock, Progress } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ChatMessage, ChecklistItem, ExpenseReport, TripDetail } from "@/lib/types";
import { CATEGORY_LABELS, cn, rupees, shortDate } from "@/lib/utils";

/* ---------------------------------------------------------------- money */

export function TripExpenses({ trip }: { trip: TripDetail }) {
  const { data, loading, error, reload } = useApi<ExpenseReport>(`/api/trips/${trip.id}/expenses/`);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {loading && !data ? <LoadingBlock /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm text-muted">Spent so far</p>
              <p className="text-2xl font-extrabold text-ink">{rupees(data.total)}</p>
              <p className="text-sm text-muted">{rupees(data.per_person_share)} each</p>
            </div>
            <Button icon="➕" onClick={() => setAdding(true)}>
              Add an expense
            </Button>
          </div>

          {data.balances.length ? (
            <section className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Who owes what</h3>
              <ul className="space-y-2.5">
                {data.balances.map((row) => (
                  <li key={row.user.id} className="flex items-center gap-3">
                    <Avatar user={row.user} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{row.user.name}</p>
                      <p className="text-xs text-muted">Paid {rupees(row.paid)}</p>
                    </div>
                    {/* Wording, not just colour, says which way the money goes. */}
                    <Chip tone={row.balance >= 0 ? "success" : "warn"}>
                      {row.balance >= 0
                        ? `Gets back ${rupees(row.balance)}`
                        : `Owes ${rupees(Math.abs(row.balance))}`}
                    </Chip>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.results.length ? (
            <ul className="card divide-y divide-[var(--line)]">
              {data.results.map((expense) => (
                <li key={expense.id} className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{expense.title}</p>
                    <p className="text-xs text-muted">
                      {expense.paid_by.name} · {shortDate(expense.spent_on)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-ink">{rupees(expense.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              emoji="👛"
              title="Nothing spent yet."
              line="Add what you pay for and we'll split it across the group."
              action={<Button onClick={() => setAdding(true)}>Add an expense</Button>}
            />
          )}
        </>
      ) : null}

      <AddExpenseSheet
        trip={trip}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          reload();
        }}
      />
    </div>
  );
}

function AddExpenseSheet({
  trip,
  open,
  onClose,
  onSaved,
}: {
  trip: TripDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: "", amount: "", category: "food", paid_by_id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useCelebration();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/trips/${trip.id}/expenses/`, {
        title: form.title.trim(),
        amount: Number(form.amount) || 0,
        category: form.category,
        paid_by_id: Number(form.paid_by_id) || user?.id,
      });
      toast("Added to the trip budget.");
      setForm({ title: "", amount: "", category: "food", paid_by_id: "" });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add an expense"
      description="Split equally across everyone on the trip."
      footer={
        <Button fullWidth size="lg" onClick={save} disabled={busy || !form.title.trim() || !form.amount}>
          {busy ? "Adding…" : "Add expense"}
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <TextField
          label="What was it for?"
          data-autofocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Dinner at the beach"
        />
        <TextField
          label="How much (₹)"
          type="number"
          min={0}
          inputMode="numeric"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="1200"
        />
        <SelectField
          label="Who paid?"
          value={form.paid_by_id || String(user?.id ?? "")}
          onChange={(e) => setForm({ ...form, paid_by_id: e.target.value })}
          options={trip.members.map((member) => ({
            value: String(member.user.id),
            label: member.user.id === user?.id ? "You" : member.user.name,
          }))}
        />
        <SelectField
          label="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ checklist */

export function TripChecklist({ trip }: { trip: TripDetail }) {
  const { data, loading, error, reload, set } = useApi<ChecklistItem[]>(
    `/api/trips/${trip.id}/checklist/`,
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const items = data ?? [];
  const done = items.filter((item) => item.is_done).length;

  async function toggle(item: ChecklistItem) {
    // Optimistic — ticking a box should feel instant.
    set(items.map((row) => (row.id === item.id ? { ...row, is_done: !row.is_done } : row)));
    try {
      await api.patch(`/api/checklist/${item.id}/`, { is_done: !item.is_done });
    } catch {
      reload();
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/trips/${trip.id}/checklist/`, { title: title.trim() });
      setTitle("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {loading && !data ? <LoadingBlock /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}

      {items.length ? (
        <div className="card p-4">
          <Progress
            value={(done / items.length) * 100}
            label={`${done} of ${items.length} sorted`}
            tone={done === items.length ? "success" : "brand"}
          />
        </div>
      ) : null}

      <form onSubmit={add} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add something to remember"
          aria-label="Add a checklist item"
          className="min-h-[46px] flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
        <Button type="submit" disabled={busy || !title.trim()}>
          Add
        </Button>
      </form>

      {items.length ? (
        <ul className="card divide-y divide-[var(--line)]">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 p-3.5">
                <input
                  type="checkbox"
                  checked={item.is_done}
                  onChange={() => toggle(item)}
                  className="h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[15px]",
                      item.is_done ? "text-muted line-through" : "text-ink",
                    )}
                  >
                    {item.title}
                  </span>
                  {item.assigned_to ? (
                    <span className="block text-xs text-muted">{item.assigned_to.name}</span>
                  ) : null}
                </span>
                {item.is_done ? (
                  <Chip tone="success">
                    <span aria-hidden="true">✓</span> Done
                  </Chip>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      ) : !loading ? (
        <EmptyState
          emoji="📝"
          title="Nothing on the list yet."
          line="Tickets, chargers, ID proofs — add whatever you don't want to forget."
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- chat */

export function TripChat({ trip }: { trip: TripDetail }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<ChatMessage[]>(`/api/trips/${trip.id}/chat/`);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [data]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/trips/${trip.id}/chat/`, { text: text.trim() });
      setText("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {loading && !data ? <LoadingBlock /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}

      <div className="card max-h-[52vh] space-y-3 overflow-y-auto p-4">
        {data?.length ? (
          data.map((message) => {
            const mine = message.user.id === user?.id;
            return (
              <div key={message.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <Avatar user={message.user} size="sm" />
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2",
                    mine ? "bg-brand text-on-brand" : "bg-raised text-ink",
                  )}
                >
                  {!mine ? (
                    <p className="text-xs font-semibold opacity-80">{message.user.name}</p>
                  ) : null}
                  <p className="text-sm">{message.text}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-6 text-center text-sm text-muted">
            No messages yet. Say hello to your group.
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message your group"
          aria-label="Type a message"
          className="min-h-[46px] flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
