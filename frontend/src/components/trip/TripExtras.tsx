"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, Chip, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { SettleUp } from "@/components/trip/SettleUp";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ChatMessage, ExpenseReport, TripDetail } from "@/lib/types";
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

          <SettleUp trip={trip} hasExpenses={data.results.length > 0} onChanged={reload} />

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

/* ----------------------------------------------------------------- chat */

/** How often an open chat checks for new messages. */
const CHAT_POLL_MS = 4000;

export function TripChat({ trip }: { trip: TripDetail }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Only follow new messages down if the reader was already at the bottom —
  // never yank them away from older messages they're scrolled up reading.
  const stickToBottom = useRef(true);
  const lastId = useRef<number | null>(null);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const seen = new Set((current ?? []).map((m) => m.id));
      const merged = [...(current ?? []), ...incoming.filter((m) => !seen.has(m.id))];
      lastId.current = merged.length ? merged[merged.length - 1].id : lastId.current;
      return merged;
    });
  }, []);

  const load = useCallback(
    () =>
      api.get<ChatMessage[]>(`/api/trips/${trip.id}/chat/`).then(
        (fresh) => {
          lastId.current = fresh.length ? fresh[fresh.length - 1].id : null;
          setMessages(fresh);
          setError(null);
        },
        (err) => setError(err instanceof ApiError ? err.message : "Couldn't load the chat."),
      ),
    [trip.id],
  );

  // First load, then keep checking for new messages while the chat is on
  // screen. Polling pauses when the tab is hidden and catches up on return.
  useEffect(() => {
    let active = true;
    // Subscribing to an external source: state is only set once the request resolves.
    const initial = window.setTimeout(() => void load(), 0);

    async function poll() {
      if (document.hidden || lastId.current === null) {
        if (lastId.current === null && !document.hidden) await load();
        return;
      }
      try {
        const fresh = await api.get<ChatMessage[]>(
          `/api/trips/${trip.id}/chat/?after=${lastId.current}`,
        );
        if (active) merge(fresh);
      } catch {
        /* a missed poll just waits for the next one */
      }
    }

    const timer = window.setInterval(poll, CHAT_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [trip.id, load, merge]);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const sent = await api.post<ChatMessage>(`/api/trips/${trip.id}/chat/`, { text: text.trim() });
      setText("");
      stickToBottom.current = true;
      merge([sent]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {messages === null && !error ? <LoadingBlock /> : null}
      {error && messages === null ? <ErrorNote message={error} onRetry={load} /> : null}

      <div ref={listRef} onScroll={onScroll} className="card max-h-[52vh] space-y-3 overflow-y-auto p-4">
        {messages?.length ? (
          messages.map((message) => {
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
                  <p className="text-sm whitespace-pre-line">{message.text}</p>
                </div>
              </div>
            );
          })
        ) : messages ? (
          <p className="py-6 text-center text-sm text-muted">
            No messages yet. Say hello to your group.
          </p>
        ) : null}
      </div>
      {error && messages !== null ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

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
