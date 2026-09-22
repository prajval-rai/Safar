"use client";

import { Bookmark, Route, Users } from "lucide-react";
import { useState } from "react";

import { TrackGrid } from "@/components/explore/Cards";
import { SegmentedControl } from "@/components/ui/Bits";

type View = "mine" | "saved" | "following";

const ICON = { size: 18, strokeWidth: 1.9 } as const;

const QUERY: Record<View, string> = {
  mine: "mine=1",
  saved: "saved=1",
  following: "following=1",
};

const EMPTY: Record<View, { title: string; line: string }> = {
  mine: {
    title: "No tracks yet.",
    line: "Finish a trip, then turn your journey into a track others can follow.",
  },
  saved: {
    title: "Nothing saved yet.",
    line: "Tap “Save for later” on any track in Explore and it lands here.",
  },
  following: {
    title: "Nothing from people you follow yet.",
    line: "Follow a few travellers from the Feed and their tracks will show up here.",
  },
};

export default function TracksPage() {
  const [view, setView] = useState<View>("mine");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Tracks</h1>
        <p className="mt-1 text-[15px] text-muted">
          Journeys you&apos;ve turned into tracks, ones you&apos;ve saved, and new ones from people you follow.
        </p>
      </header>

      <div className="hide-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl
          label="Which tracks to show"
          value={view}
          onChange={setView}
          options={[
            { value: "mine", label: "My tracks", icon: <Route {...ICON} /> },
            { value: "saved", label: "Saved", icon: <Bookmark {...ICON} /> },
            { value: "following", label: "Following", icon: <Users {...ICON} /> },
          ]}
        />
      </div>

      {/* key forces a fresh fetch and skeleton when the tab changes. */}
      <TrackGrid
        key={view}
        query={QUERY[view]}
        emptyTitle={EMPTY[view].title}
        emptyLine={EMPTY[view].line}
      />
    </div>
  );
}
