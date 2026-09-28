"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api, request } from "@/lib/api";
import type { RewardOffer } from "@/lib/types";

import { RewardImage } from "./RewardImage";

const MAX_IMAGE_MB = 5;

/** Add a reward, or change one — admin page only. The server refuses anyone
 *  who isn't an admin, whatever the UI shows. */
export function RewardEditor({
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

  function pick(file: File | null) {
    if (file && file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Pick a picture under ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setError(null);
    setImage(file);
    if (file) setPreview(URL.createObjectURL(file));
  }

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
    if (!offer || !window.confirm(`Delete "${offer.title}"? Every claim on it goes too.`)) return;
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
      title={offer ? "Edit reward" : "Add a reward"}
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

        <label className="group block cursor-pointer overflow-hidden rounded-2xl border border-dashed border-line">
          <RewardImage src={preview}>
            <span className="absolute right-3 bottom-3 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-bold text-ink shadow">
              {preview ? "Change picture" : "Upload picture"}
            </span>
          </RewardImage>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only-text"
            aria-label="Reward picture"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="-mt-2 text-xs text-muted">
          PNG, JPG or WebP up to {MAX_IMAGE_MB} MB. The whole picture is shown — nothing gets cropped.
        </p>

        <TextField
          label="Title"
          data-autofocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Travel diary"
        />
        <TextAreaField
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What they get, and how to collect it."
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
