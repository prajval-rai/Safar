"use client";

import { ExternalLink, Music, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Only one soundtrack plays at a time, across every player on the page. */
let playing: { pause(): void } | null = null;
function claim(player: { pause(): void }) {
  if (playing && playing !== player) playing.pause();
  playing = player;
}

/** Events a browser counts as the visitor really interacting — the only
 *  thing that unlocks sound. Clicks faked from code never count. */
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown", "click"] as const;

type Gate = { heading: string; line: string };

interface PlayerProps {
  song: Song;
  variant?: "chip" | "full";
  /** Start straight away (when the browser allows) and loop while the page is open. */
  autoPlay?: boolean;
  /** The welcome cover shown while the browser is holding the music back. */
  gate?: Gate;
}

/**
 * A story's soundtrack: the song's 30-second Apple Music preview, streamed
 * from Apple with a link back to the full song — no video, just music. It
 * loops while the visitor stays, pauses while the tab is hidden, and — since
 * browsers refuse sound until the visitor interacts, and synthetic clicks
 * can't get around that — starts on their first real tap, which the `gate`
 * cover turns into "Open story".
 */
export function SoundtrackPlayer(props: PlayerProps) {
  return <ApplePreview {...props} />;
}

/** Keeps a player going only while the page is in front of the visitor, and
 *  starts it on their first real interaction when autoplay was refused. */
function useAutoplay({
  enabled,
  play,
  pause,
  isPlaying,
  onBlocked,
  onStarted,
  wantedRef,
}: {
  enabled: boolean;
  play: () => Promise<boolean>;
  pause: () => void;
  isPlaying: () => boolean;
  onBlocked: () => void;
  onStarted: () => void;
  wantedRef: React.RefObject<boolean>;
}) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const unlock = () => {
      removeUnlock();
      wantedRef.current = true;
      void play().then((ok) => ok && active && onStarted());
    };
    const removeUnlock = () => {
      for (const name of UNLOCK_EVENTS) window.removeEventListener(name, unlock, true);
    };
    const onVisibility = () => {
      if (document.hidden) pause();
      else if (wantedRef.current && !isPlaying()) void play();
    };

    wantedRef.current = true;
    void play().then((ok) => {
      if (!active) return;
      if (ok) {
        onStarted();
        return;
      }
      // Held back until they interact — their first real tap or key starts it.
      onBlocked();
      for (const name of UNLOCK_EVENTS) window.addEventListener(name, unlock, true);
    });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      removeUnlock();
      document.removeEventListener("visibilitychange", onVisibility);
      wantedRef.current = false;
      pause();
    };
    // The callbacks are stable for a given player; re-run only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/* ------------------------------------------------------ Apple preview */

function ApplePreview({ song, variant = "chip", autoPlay = false, gate }: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const handle = useRef({ pause: () => audioRef.current?.pause() });
  const wanted = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const canPlay = Boolean(song.preview_url);

  function play(): Promise<boolean> {
    const audio = audioRef.current;
    if (!audio) return Promise.resolve(false);
    claim(handle.current);
    return audio.play().then(
      () => true,
      () => false,
    );
  }

  useAutoplay({
    enabled: autoPlay && canPlay,
    play,
    pause: () => audioRef.current?.pause(),
    isPlaying: () => Boolean(audioRef.current && !audioRef.current.paused),
    onBlocked: () => setWaiting(true),
    onStarted: () => setWaiting(false),
    wantedRef: wanted,
  });

  function toggle(event: React.MouseEvent) {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      wanted.current = true;
      void play();
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

  const button = canPlay ? (
    <PlayButton playing={isPlaying} title={song.title} size={variant === "full" ? "lg" : "sm"} onClick={toggle} />
  ) : null;

  if (variant === "chip") {
    return (
      <div className="mt-3 flex w-fit max-w-full items-center gap-2 rounded-full bg-raised py-1 pr-2 pl-1 text-xs font-semibold text-ink">
        {audio}
        {button ?? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Music size={13} aria-hidden="true" />
          </span>
        )}
        <span className="truncate">
          {song.title} · <span className="font-normal text-muted">{song.artist}</span>
        </span>
        <SourceLink song={song} />
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-4 p-3 pr-4">
      {audio}
      {gate && waiting && canPlay ? <StoryGate gate={gate} song={song} onOpen={() => void play()} /> : null}
      {song.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={song.image}
          alt=""
          className={cn("h-16 w-16 shrink-0 rounded-xl object-cover", isPlaying && "shadow-lg shadow-brand/30")}
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Music size={24} aria-hidden="true" />
        </span>
      )}
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
          · <SourceLink song={song} label />
        </p>
      </div>
      {button}
    </div>
  );
}

/* ------------------------------------------------------------- shared */

function PlayButton({
  playing: isPlaying,
  title,
  size,
  onClick,
}: {
  playing: boolean;
  title: string;
  size: "sm" | "lg";
  onClick: (event: React.MouseEvent) => void;
}) {
  const icon = size === "lg" ? 20 : 13;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand text-on-brand transition-transform hover:scale-105",
        size === "lg" ? "h-12 w-12" : "h-7 w-7",
      )}
    >
      {isPlaying ? (
        <Pause size={icon} fill="currentColor" aria-hidden="true" />
      ) : (
        <Play size={icon} fill="currentColor" className="ml-0.5" aria-hidden="true" />
      )}
    </button>
  );
}

function SourceLink({ song, label = false }: { song: Song; label?: boolean }) {
  const where = "Apple Music";
  return label ? (
    <a href={song.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
      Listen on {where} ↗
    </a>
  ) : (
    <a
      href={song.url}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 text-muted hover:text-brand"
      aria-label={`Open ${song.title} on ${where}`}
      title={`Open on ${where}`}
    >
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

/** Full-screen welcome cover. Its tap is the real interaction browsers need
 *  before sound, so opening the story and starting the music are one tap. */
function StoryGate({ gate, song, onOpen }: { gate: Gate; song: Song; onOpen: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <button
      type="button"
      onClick={onOpen}
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
  );
}
