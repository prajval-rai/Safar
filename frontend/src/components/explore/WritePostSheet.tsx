"use client";

import { useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";

import { SongPicker } from "./SongPicker";
import { api, ApiError, rows } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Paginated, Song, TravelPost, Trip } from "@/lib/types";

const MAX = 1000;

/** Write a short story or tip for the Feed — with or without a trip attached. */
export function WritePostSheet({
  open,
  onClose,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const { toast } = useCelebration();
  const [caption, setCaption] = useState("");
  const [place, setPlace] = useState("");
  const [trip, setTrip] = useState("");
  const [song, setSong] = useState<Song | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only fetched once the sheet is opened for the first time.
  const { data } = useApi<Paginated<Trip> | Trip[]>(open ? "/api/trips/" : null);
  const trips = rows(data);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post<TravelPost>("/api/explore/posts/", {
        caption: caption.trim(),
        place: place.trim(),
        ...(trip ? { trip } : {}),
        ...(song ? { song_id: song.id } : {}),
      });
      toast("Posted to the feed.");
      setCaption("");
      setPlace("");
      setTrip("");
      setSong(null);
      onPosted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Write a post"
      description="A story, a tip or a warning for the next traveller. Keep it short."
      footer={
        <Button fullWidth size="lg" onClick={submit} disabled={busy || !caption.trim()}>
          {busy ? "Posting…" : "Post"}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextAreaField
          label="What happened?"
          data-autofocus
          rows={5}
          maxLength={MAX}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Reached Amer Fort at sunrise — no queue, no crowd, worth the 5 a.m. alarm."
          hint={`${caption.length}/${MAX}`}
        />
        <TextField
          label="Place (optional)"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={120}
          placeholder="Jaipur, Rajasthan"
        />
        {trips.length ? (
          <SelectField
            label="From a trip (optional)"
            value={trip}
            onChange={(e) => setTrip(e.target.value)}
            options={[
              { value: "", label: "Not linked to a trip" },
              ...trips.map((t) => ({ value: t.id, label: t.title })),
            ]}
          />
        ) : null}
        <SongPicker value={song} onChange={setSong} />
        {error ? (
          <p className="text-sm font-semibold text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
