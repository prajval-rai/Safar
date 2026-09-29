"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { OpenTripsList } from "@/components/explore/OpenTrips";

export default function ExplorePage() {
  // Explore is for upcoming trips you can ask to join. Finished routes to
  // copy live under Tracks.
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Explore</h1>
        <p className="mt-1 text-[15px] text-muted">
          Upcoming trips looking for travellers — ask to join and the organiser will let you in.
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
          placeholder="Search a place or trip"
          aria-label="Search upcoming trips"
          className="min-h-[48px] w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
      </div>

      <OpenTripsList query={query} />
    </div>
  );
}
