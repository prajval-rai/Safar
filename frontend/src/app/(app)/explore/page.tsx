"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { TrackGrid } from "@/components/explore/Cards";
import { cn } from "@/lib/utils";

const REGIONS = ["All", "Goa", "Rajasthan", "Himachal Pradesh", "Kerala", "Ladakh", "Uttarakhand"];

export default function ExplorePage() {
  const [region, setRegion] = useState("All");
  const [query, setQuery] = useState("");

  const params = new URLSearchParams({ sort: "popular" });
  if (region !== "All") params.set("region", region);
  if (query.trim()) params.set("search", query.trim());

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Explore</h1>
        <p className="mt-1 text-[15px] text-muted">
          Routes other travellers have already done — copy one and make it yours.
        </p>
      </header>

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

      <TrackGrid
        query={params.toString()}
        emptyTitle="No tracks here yet."
        emptyLine="Try another region — or finish a trip and publish the first one."
      />
    </div>
  );
}
