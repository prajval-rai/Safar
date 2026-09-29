"use client";

import { useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError, api, mediaSrc, request } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Memory, TripDetail, XPResult } from "@/lib/types";
import { shortDate } from "@/lib/utils";

export function TripMemories({ trip, onChanged }: { trip: TripDetail; onChanged?: () => void }) {
  const { data, loading, error, reload } = useApi<Memory[]>(`/api/trips/${trip.id}/memories/`);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { toast } = useCelebration();
  const past = trip.past_trip;
  // A past trip's photos are its proof: added while drafting, then frozen for review.
  const canAdd = !past || (past.editable && trip.my_role === "owner" && (data?.length ?? 0) < past.max_photos);

  async function remove(memory: Memory) {
    setRemoving(memory.id);
    try {
      await api.del(`/api/trips/${trip.id}/memories/${memory.id}/`);
      toast("Photo removed.");
      reload();
      onChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove that.", "error");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      {past && past.review_status !== "approved" ? (
        <p className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          <span aria-hidden="true">🔎 </span>
          These photos are what an admin checks before approving the trip. Add real ones from the trip (you in
          them helps) and at least {past.requirements.find((r) => r.key === "photos")?.need ?? 1}. Up to{" "}
          {past.max_photos}.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {data?.length ?? 0} {past ? (data?.length === 1 ? "photo" : "photos") : data?.length === 1 ? "memory" : "memories"} from this trip
        </p>
        {canAdd ? (
          <Button size="sm" icon="📸" onClick={() => setAdding(true)}>
            {past ? "Add a photo" : "Add a memory"}
          </Button>
        ) : null}
      </div>

      {loading && !data ? <LoadingBlock /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}

      {data ? (
        data?.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((memory) => (
              <li key={memory.id} className="card overflow-hidden">
                {memory.image || memory.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={memory.image ? mediaSrc(memory.image) : memory.image_url}
                    alt={memory.caption || "Trip photo"}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-brand-soft text-4xl">
                    <span aria-hidden="true">📷</span>
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm font-semibold text-ink">{memory.caption || "Untitled"}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Avatar user={memory.user} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {memory.user.name} · {shortDate(memory.created_at.slice(0, 10))}
                    </span>
                    {past?.editable && trip.my_role === "owner" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(memory)}
                        disabled={removing === memory.id}
                        aria-label={`Remove ${memory.caption || "this photo"}`}
                      >
                        {removing === memory.id ? "Removing…" : "Remove"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            emoji="📸"
            title="No photos yet."
            line={
              past
                ? "Add photos from the trip — they're how an admin knows you were there."
                : "Add one as you go — they all end up in your trip story at the end."
            }
            action={canAdd ? <Button onClick={() => setAdding(true)}>{past ? "Add a photo" : "Add a memory"}</Button> : undefined}
          />
        )
      ) : null}

      <AddMemorySheet
        trip={trip}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          reload();
          onChanged?.();
        }}
      />
    </div>
  );
}

function AddMemorySheet({
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
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { celebrate, toast } = useCelebration();
  // A past trip needs real photos; a caption alone isn't proof of anything.
  const past = trip.is_past;

  function pick(selected: File | null) {
    setFile(selected);
    setPreview(selected ? URL.createObjectURL(selected) : null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("caption", caption);
      if (file) form.append("image", file);

      const result = await request<XPResult>(`/api/trips/${trip.id}/memories/`, {
        method: "POST",
        form,
      });
      celebrate(result);
      setCaption("");
      pick(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
      toast("Couldn't save that memory.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a memory"
      description={past ? "A photo from the trip and a line about it." : "A photo and a line about it. Worth +15 XP."}
      footer={
        <Button fullWidth size="lg" onClick={save} disabled={busy || (past ? !file : !caption.trim() && !file)}>
          {busy ? "Saving…" : "Save memory"}
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div>
          <label
            htmlFor="memory-photo"
            className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-raised p-4 text-center"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Selected photo" className="max-h-40 rounded-lg object-contain" />
            ) : (
              <>
                <span className="text-3xl" aria-hidden="true">
                  📷
                </span>
                <span className="text-sm font-semibold text-ink">Choose a photo</span>
                <span className="text-xs text-muted">
                  {past ? "Required for a past trip" : "Optional — a caption alone works too"}
                </span>
              </>
            )}
          </label>
          <input
            id="memory-photo"
            type="file"
            accept="image/*"
            className="sr-only-text"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>

        <TextField
          label="What was it?"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Sunset from the fort 🌅"
        />
      </div>
    </Sheet>
  );
}
