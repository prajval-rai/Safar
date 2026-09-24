"use client";

import { ExternalLink, Music, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Only one soundtrack plays at a time, across every player on the page. */
let playing: HTMLAudioElement | null = null;
function claim(audio: HTMLAudioElement) {
  if (playing && playing !== audio) playing.pause();
  playing = audio;
}

/** Events a browser counts as the visitor really interacting — the only
 *  thing that unlocks sound. Clicks faked from code never count. */
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown", "click"] as const;

/**
 * Plays a song's 30-second Apple Music preview (streamed from Apple, with a
 * link back to the full song).
 *
 * `autoPlay` starts it straight away when the browser allows (e.g. for
 * visitors who often play media here) and loops it for as long as the page is
 * open — pausing while the tab is hidden, resuming when it's back. Browsers
 * refuse sound until the visitor interacts, and synthetic clicks can't get
 * around that; so when blocked, `gate` shows a welcome cover whose "Open
 * story" tap is that interaction — the music starts with it.
 */
export function SoundtrackPlayer({
  song,
  variant = "chip",
  autoPlay = false,
  gate,
}: {
  song: Song;
  variant?: "chip" | "full";
  autoPlay?: boolean;
  /** The welcome cover shown while the browser is holding the music back. */
  gate?: { heading: string; line: string };
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Whether the music should be on — so hiding the tab can pause it without
  // forgetting to resume, and a deliberate pause is respected.
  const wanted = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const canPlay = Boolean(song.preview_url);

  function start() {
    const audio = audioRef.current;
    if (!audio) return;
    wanted.current = true;
    claim(audio);
    void audio.play().then(
      () => setWaiting(false),
      () => setWaiting(true),
    );
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !autoPlay || !canPlay) return;

    const unlock = () => {
      removeUnlock();
      wanted.current = true;
      claim(audio);
      void audio.play().then(
        () => setWaiting(false),
        () => undefined,
      );
    };
    const removeUnlock = () => {
      for (const name of UNLOCK_EVENTS) window.removeEventListener(name, unlock, true);
    };
    // Keep playing only while the page is actually in front of them.
    const onVisibility = () => {
      if (document.hidden) audio.pause();
      else if (wanted.current) void audio.play().catch(() => undefined);
    };

    wanted.current = true;
    claim(audio);
    audio.play().catch(() => {
      // Held back until they interact — their first real tap or key starts it.
      setWaiting(true);
      for (const name of UNLOCK_EVENTS) window.addEventListener(name, unlock, true);
    });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      removeUnlock();
      document.removeEventListener("visibilitychange", onVisibility);
      wanted.current = false;
      audio.pause();
    };
  }, [autoPlay, canPlay, song.preview_url]);

  function toggle(event: React.MouseEvent) {
    // Stop the tap from also counting as the page-wide "first interaction".
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      start();
    } else {
      wanted.current = false;
      audio.pause();
    }
  }

  const audio = canPlay ? (
    <audio
      ref={audioRef}
      src={song.preview_url}
      preload={autoPlay ? "auto" : "none"}
      // The story page repeats the clip for as long as the visitor stays.
      loop={variant === "full"}
      onPlay={() => {
        setIsPlaying(true);
        setWaiting(false);
      }}
      onPause={() => setIsPlaying(false)}
      onEnded={() => setIsPlaying(false)}
      onTimeUpdate={(e) => {
        const a = e.currentTarget;
        setProgress(a.duration ? a.currentTime / a.duration : 0);
      }}
    />
  ) : null;

  const playButton = canPlay ? (
    <button
      type="button"
      onClick={toggle}
      aria-label={isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand text-on-brand transition-transform hover:scale-105",
        variant === "full" ? "h-12 w-12" : "h-7 w-7",
      )}
    >
      {isPlaying ? (
        <Pause size={variant === "full" ? 20 : 13} fill="currentColor" aria-hidden="true" />
      ) : (
        <Play size={variant === "full" ? 20 : 13} fill="currentColor" className="ml-0.5" aria-hidden="true" />
      )}
    </button>
  ) : null;

  if (variant === "chip") {
    return (
      <div className="mt-3 flex w-fit max-w-full items-center gap-2 rounded-full bg-raised py-1 pr-2 pl-1 text-xs font-semibold text-ink">
        {audio}
        {playButton ?? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Music size={13} aria-hidden="true" />
          </span>
        )}
        <span className="truncate">
          {song.title} · <span className="font-normal text-muted">{song.artist}</span>
        </span>
        <a
          href={song.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted hover:text-brand"
          aria-label={`Open ${song.title} in Apple Music`}
          title="Open in Apple Music"
        >
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    );
  }

  // Full-screen welcome cover: its tap is the interaction that unlocks sound,
  // so opening the story and starting the music are one and the same.
  const cover =
    gate && waiting && canPlay && typeof document !== "undefined"
      ? createPortal(
          <button
            type="button"
            onClick={start}
            className="animate-fade fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-brand-strong via-brand to-brand-bright px-6 text-center text-white"
            aria-label={`Open the story and play ${song.title}`}
          >
            <span className="text-sm font-extrabold tracking-[0.3em] text-white/80">SAFAR · TRAVEL STORY</span>
            <span className="max-w-md text-3xl font-extrabold drop-shadow sm:text-4xl">{gate.heading}</span>
            <span className="text-base text-white/85">{gate.line}</span>
            <span className="mt-2 flex max-w-sm items-center gap-3 rounded-2xl bg-white/15 p-2 pr-4 text-left backdrop-blur">
              {song.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={song.image} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : null}
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">♫ {song.title}</span>
                <span className="block truncate text-xs text-white/80">{song.artist}</span>
              </span>
            </span>
            <span className="mt-3 animate-pulse rounded-full bg-white px-8 py-3.5 text-base font-extrabold text-brand shadow-xl">
              Open story ✨
            </span>
            <span className="text-xs text-white/70">Tap anywhere · the music plays with the story</span>
          </button>,
          document.body,
        )
      : null;

  return (
    <div className="card flex items-center gap-4 p-3 pr-4">
      {audio}
      {cover}
      <div className="relative shrink-0">
        {song.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={song.image}
            alt=""
            className={cn("h-16 w-16 rounded-xl object-cover", isPlaying && "shadow-lg shadow-brand/30")}
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Music size={24} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-ink">{song.title}</p>
        <p className="truncate text-sm text-muted">{song.artist}</p>
        {canPlay ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}
        <p className="mt-1.5 text-xs text-muted">
          {waiting ? (
            <span className="font-semibold text-brand">Tap anywhere to start the music ♫</span>
          ) : canPlay ? (
            "30-sec preview · repeats while you read"
          ) : (
            "Preview not available"
          )}{" "}
          ·{" "}
          <a href={song.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
            Listen on Apple Music ↗
          </a>
        </p>
      </div>
      {playButton}
    </div>
  );
}
