"use client";

import { PenLine, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PostList } from "@/components/explore/Cards";
import { WritePostSheet } from "@/components/explore/WritePostSheet";
import { FollowButton } from "@/components/social/FollowButton";
import { Avatar, SegmentedControl } from "@/components/ui/Bits";
import { api } from "@/lib/api";
import type { Person } from "@/lib/types";

type Scope = "everyone" | "following";

const ICON = { size: 18, strokeWidth: 1.9 } as const;

export default function FeedPage() {
  const [scope, setScope] = useState<Scope>("everyone");
  const [query, setQuery] = useState("");
  const [writing, setWriting] = useState(false);
  // Bumping this remounts the list so a new post shows up straight away.
  const [fresh, setFresh] = useState(0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Feed</h1>
          <p className="mt-1 text-[15px] text-muted">Short stories and tips from people on the road.</p>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setWriting(true)}
        className="card mx-auto flex w-full max-w-2xl items-center gap-3 p-4 text-left transition-colors hover:bg-raised"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
          <PenLine size={18} strokeWidth={1.9} />
        </span>
        <span className="text-[15px] text-muted">Share a story or tip from your travels…</span>
      </button>

      <WritePostSheet open={writing} onClose={() => setWriting(false)} onPosted={() => setFresh((n) => n + 1)} />

      <FindTravellers />

      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <SegmentedControl
          label="Whose posts to show"
          value={scope}
          onChange={setScope}
          options={[
            { value: "everyone", label: "Everyone", icon: <Users {...ICON} /> },
            { value: "following", label: "Following" },
          ]}
        />

        <div className="relative">
          <Search
            size={18}
            strokeWidth={1.9}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts"
            aria-label="Search posts"
            className="min-h-[48px] w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {/* key restarts the list cleanly when the tab changes. */}
      <PostList key={`${scope}-${fresh}`} query={query} following={scope === "following"} />
    </div>
  );
}

/** Search travellers by name or username, and follow them right from the results. */
function FindTravellers() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);

  // Debounced; state is only set inside the timer callback.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const needle = query.trim();
      if (needle.length < 2) {
        setResults(null);
        return;
      }
      api
        .get<Person[]>(`/api/users/search/?q=${encodeURIComponent(needle)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <section className="card mx-auto max-w-2xl p-4" aria-labelledby="find-heading">
      <h2 id="find-heading" className="mb-2.5 text-sm font-bold text-ink">
        Find travellers to follow
      </h2>
      <div className="relative">
        <Search
          size={18}
          strokeWidth={1.9}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or username"
          aria-label="Search travellers"
          className="min-h-[46px] w-full rounded-xl border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
      </div>

      {results ? (
        results.length ? (
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {results.map((person) => (
              <li key={person.id} className="flex items-center gap-3 py-2.5">
                <Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={person} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{person.name}</span>
                    <span className="block truncate text-xs text-muted">
                      @{person.username} · Level {person.level}
                    </span>
                  </span>
                </Link>
                <FollowButton username={person.username} following={person.is_following} size="sm" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Nobody found for “{query.trim()}”.</p>
        )
      ) : null}
    </section>
  );
}
