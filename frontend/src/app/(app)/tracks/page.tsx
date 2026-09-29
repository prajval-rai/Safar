"use client";

import { Bookmark, Compass, Route, Search, Users } from "lucide-react";
import { useState } from "react";

import { TrackGrid } from "@/components/explore/Cards";
import { SegmentedControl } from "@/components/ui/Bits";
import { cn } from "@/lib/utils";

type View = "all" | "mine" | "saved" | "following";

const ICON = { size: 18, strokeWidth: 1.9 } as const;

const REGIONS = ["All", "Goa", "Rajasthan", "Himachal Pradesh", "Kerala", "Ladakh", "Uttarakhand"];

const QUERY: Record<Exclude<View, "all">, string> = {
  mine: "mine=1",
  saved: "saved=1",
  following: "following=1",
};

const EMPTY: Record<View, { title: string; line: string }> = {
  all: {
    title: "No tracks here yet.",
    line: "Try another region — or finish a trip and publish the first one.",
  },
  mine: {
    title: "No tracks yet.",
    line: "Finish a trip, then turn your journey into a track others can follow.",
  },
  saved: {
    title: "Nothing saved yet.",
    line: "Tap “Save for later” on any track and it lands here.",
  },
  following: {
    title: "Nothing from people you follow yet.",
    line: "Follow a few travellers from the Feed and their tracks will show up here.",
  },
};

export default function TracksPage() {
  // Every track is a finished, guided route — copy one and make it yours.
  const [view, setView] = useState<View>("all");
  const [region, setRegion] = useState("All");
  const [query, setQuery] = useState("");

  let trackQuery: string;
  if (view === "all") {
    const params = new URLSearchParams({ sort: "popular" });
    if (region !== "All") params.set("region", region);
    if (query.trim()) params.set("search", query.trim());
    trackQuery = params.toString();
  } else {
    trackQuery = QUERY[view];
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Tracks</h1>
        <p className="mt-1 text-[15px] text-muted">
          Guided routes from finished trips — copy one and make it yours.
        </p>
      </header>

      <div className="hide-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          label="Which tracks to show"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All tracks", icon: <Compass {...ICON} /> },
            { value: "mine", label: "Mine", icon: <Route {...ICON} /> },
            { value: "saved", label: "Saved", icon: <Bookmark {...ICON} /> },
            { value: "following", label: "Following", icon: <Users {...ICON} /> },
          ]}
        />
      </div>

      {view === "all" ? (
        <>
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
              placeholder="Search a place or route"
              aria-label="Search tracks"
              className="min-h-[48px] w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>
          <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {REGIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRegion(item)}
                aria-pressed={region === item}
                className={cn(
                  "min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors",
                  region === item
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line bg-surface text-ink hover:bg-raised",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* key forces a fresh fetch and skeleton when the tab changes. */}
      <TrackGrid
        key={view}
        query={trackQuery}
        emptyTitle={EMPTY[view].title}
        emptyLine={EMPTY[view].line}
      />
    </div>
  );
}
