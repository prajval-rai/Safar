"use client";

import { Music, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError, api } from "@/lib/api";
import type { Song } from "@/lib/types";

/** Pick a song as a trip's soundtrack — searched from Apple Music. Shows the
 *  chosen song as a chip that can be removed; otherwise a search box. */
export function SongPicker({
  value,
  onChange,
}: {
  value: Song | null;
  onChange: (song: Song | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced; state is only set from the timer / request callbacks.
  useEffect(() => {
    const needle = query.trim();
    const timer = window.setTimeout(() => {
      if (needle.length < 2) {
        setResults(null);
        return;
      }
      api
        .get<Song[]>(`/api/music/search/?q=${encodeURIComponent(needle)}`)
        .then((songs) => {
          setResults(songs);
          setError(null);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't search songs."));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink">Soundtrack</p>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-raised p-2 pr-3">
          <SongArt song={value} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink">{value.title}</span>
            <span className="block truncate text-xs text-muted">{value.artist}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="tap flex items-center justify-center rounded-lg text-muted hover:text-danger"
            aria-label={`Remove ${value.title}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="song-search" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Music size={15} aria-hidden="true" /> Add a song <span className="font-normal text-muted">(optional)</span>
      </label>
      <div className="relative">
        <Search
          size={17}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id="song-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a song — Kesariya, Ilahi, Safarnama…"
          className="min-h-[46px] w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {results ? (
        results.length ? (
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-1">
            {results.map((song) => (
              <li key={song.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(song);
                    setQuery("");
                    setResults(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-raised"
                >
                  <SongArt song={song} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{song.title}</span>
                    <span className="block truncate text-xs text-muted">{song.artist}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No songs found for “{query.trim()}”.</p>
        )
      ) : null}
      <p className="mt-1.5 text-xs text-muted">Songs from Apple Music — a 30-second preview plays on your story&apos;s page.</p>
    </div>
  );
}

function SongArt({ song }: { song: Song }) {
  return song.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={song.image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
      <Music size={18} aria-hidden="true" />
    </span>
  );
}
