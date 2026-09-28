"use client";

import { useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Chip, ErrorNote, LoadingBlock, Progress } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api, request } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { RewardOffer } from "@/lib/types";
import { cn, formatNumber, shortDate } from "@/lib/utils";

/**
 * Real rewards travellers can claim once they've earned enough XP. Claiming
 * doesn't spend XP — it's a bar you clear — and each reward only goes to as
 * many people as its rule allows. Staff put rewards up (with a picture) and
 * manage them from here.
 */
export function RewardCatalog({ myXp }: { myXp: number }) {
  const { user } = useAuth();
  const { toast } = useCelebration();
  const { data, loading, error, reload } = useApi<RewardOffer[]>("/api/rewards/catalog/");
  const [editing, setEditing] = useState<RewardOffer | "new" | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const isStaff = Boolean(user?.is_staff);

  async function claim(offer: RewardOffer) {
    setBusyId(offer.id);
    try {
      await api.post(`/api/rewards/catalog/${offer.id}/claim/`);
      toast(`Claimed: ${offer.title} 🎁`);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't claim that.", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  const offers = data ?? [];

  return (
    <div className="space-y-3">
      {isStaff ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted">
            <b className="text-ink">Staff</b> — put up a reward with a picture, the XP needed, and how many people can
            claim it.
          </p>
          <Button size="sm" icon="➕" onClick={() => setEditing("new")}>
            Add reward
          </Button>
        </div>
      ) : null}

      {offers.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {offers.map((offer) => {
            const progress = Math.min(100, (myXp / Math.max(offer.xp_required, 0.01)) * 100);
            return (
              <li
                key={offer.id}
                className={cn(
                  "card flex flex-col overflow-hidden",
                  offer.claimed_by_me && "border-brand/35",
                  !offer.is_active && "opacity-70",
                )}
              >
                {offer.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={offer.image} alt="" className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-raised text-5xl" aria-hidden="true">
                    🎁
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-bold text-ink">{offer.title}</p>
                    <Chip tone="brand">{formatNumber(offer.xp_required)} XP</Chip>
                  </div>
                  {offer.description ? <p className="text-sm text-muted">{offer.description}</p> : null}
                  <p className="text-xs font-semibold text-muted">
                    {offer.spots_left
                      ? `${offer.spots_left} of ${offer.max_claims} left`
                      : `All ${offer.max_claims} claimed`}
                    {!offer.is_active ? " · Hidden from travellers" : ""}
                  </p>
                  {!offer.claimed_by_me && myXp < offer.xp_required ? (
                    <Progress
                      value={progress}
                      size="sm"
                      label={`${formatNumber(myXp)} / ${formatNumber(offer.xp_required)} XP`}
                    />
                  ) : null}

                  <div className="mt-auto pt-1">
                    {offer.claimed_by_me ? (
                      <Chip tone="success">
                        <span aria-hidden="true">✓</span> Claimed
                      </Chip>
                    ) : (
                      <Button
                        fullWidth
                        size="sm"
                        onClick={() => claim(offer)}
                        disabled={Boolean(offer.blocked_reason) || busyId === offer.id}
                      >
                        {busyId === offer.id ? "Claiming…" : offer.blocked_reason || "Claim reward"}
                      </Button>
                    )}
                  </div>

                  {isStaff ? (
                    <div className="mt-2 border-t border-line pt-2">
                      <Button variant="secondary" size="sm" fullWidth onClick={() => setEditing(offer)}>
                        Manage
                      </Button>
                      {offer.claimants.length ? (
                        <details className="mt-2 text-xs text-muted">
                          <summary className="cursor-pointer font-semibold">
                            Claimed by {offer.claimants.length}
                          </summary>
                          <ul className="mt-1 space-y-0.5">
                            {offer.claimants.map((c) => (
                              <li key={c.id}>
                                {c.name} (@{c.username}) · {shortDate(c.claimed_at.slice(0, 10))}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card p-6 text-center text-sm text-muted">
          No rewards up for grabs yet — keep travelling and check back soon.
        </p>
      )}

      {isStaff && editing ? (
        <RewardEditor
          key={editing === "new" ? "new" : editing.id}
          offer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function RewardEditor({
  offer,
  onClose,
  onSaved,
}: {
  offer: RewardOffer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useCelebration();
  const [form, setForm] = useState({
    title: offer?.title ?? "",
    description: offer?.description ?? "",
    xp_required: offer ? String(offer.xp_required) : "",
    max_claims: offer ? String(offer.max_claims) : "1",
    is_active: offer?.is_active ?? true,
  });
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(offer?.image ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = form.title.trim() && Number(form.xp_required) > 0 && Number(form.max_claims) >= 1;

  async function save() {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("title", form.title.trim());
    body.append("description", form.description.trim());
    body.append("xp_required", form.xp_required);
    body.append("max_claims", form.max_claims);
    body.append("is_active", String(form.is_active));
    if (image) body.append("image", image);
    try {
      if (offer) {
        await request(`/api/rewards/catalog/${offer.id}/`, { method: "PATCH", form: body });
      } else {
        await api.upload("/api/rewards/catalog/", body);
      }
      toast(offer ? "Reward updated." : "Reward added.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that reward.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!offer || !window.confirm(`Delete "${offer.title}"? Its claims go with it.`)) return;
    setBusy(true);
    try {
      await api.del(`/api/rewards/catalog/${offer.id}/`);
      toast("Reward deleted.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that reward.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={offer ? "Manage reward" : "Add a reward"}
      description="Claiming doesn't spend XP — it's the bar someone has to clear."
      footer={
        <div className="flex flex-col gap-2">
          <Button fullWidth size="lg" onClick={save} disabled={busy || !valid}>
            {busy ? "Saving…" : offer ? "Save changes" : "Add reward"}
          </Button>
          {offer ? (
            <Button variant="danger" fullWidth onClick={remove} disabled={busy}>
              Delete reward
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Picture</p>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="mb-2 h-36 w-full rounded-xl object-cover" />
          ) : null}
          <input
            type="file"
            accept="image/*"
            aria-label="Reward picture"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:font-semibold file:text-brand"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setImage(file);
              if (file) setPreview(URL.createObjectURL(file));
            }}
          />
        </div>

        <TextField
          label="Title"
          data-autofocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Free trek gear rental"
        />
        <TextAreaField
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What they get, and how to redeem it."
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="XP needed"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={form.xp_required}
            onChange={(e) => setForm({ ...form, xp_required: e.target.value })}
            placeholder="100"
          />
          <TextField
            label="How many people"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={form.max_claims}
            onChange={(e) => setForm({ ...form, max_claims: e.target.value })}
          />
        </div>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Visible to travellers
        </label>
      </div>
    </Sheet>
  );
}
