"use client";

import Link from "next/link";

import { Avatar, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Sheet } from "@/components/ui/Sheet";
import { useApi } from "@/lib/hooks";
import type { Person } from "@/lib/types";

import { FollowButton } from "./FollowButton";

export type PeopleKind = "followers" | "following";

/**
 * Who follows someone, or who they follow. Mount it only while it's open, so
 * every opening fetches a fresh list.
 */
export function PeopleSheet({
  username,
  kind,
  onClose,
}: {
  username: string;
  kind: PeopleKind;
  onClose: () => void;
}) {
  const { data, error, reload } = useApi<Person[]>(`/api/users/${encodeURIComponent(username)}/${kind}/`);

  return (
    <Sheet
      open
      onClose={onClose}
      title={kind === "followers" ? "Followers" : "Following"}
      description={kind === "followers" ? `People who follow @${username}` : `People @${username} follows`}
    >
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!data && !error ? <LoadingBlock label="Loading people…" /> : null}

      {data ? (
        data.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {data.map((person) => (
              <li key={person.id} className="flex items-center gap-3 py-3">
                <Link
                  href={person.is_me ? "/profile" : `/u/${person.username}`}
                  onClick={onClose}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar user={person} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{person.name}</span>
                    <span className="block truncate text-xs text-muted">
                      @{person.username} · Level {person.level}
                    </span>
                  </span>
                </Link>
                {person.is_me ? null : (
                  <FollowButton username={person.username} following={person.is_following} size="sm" />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted">
            {kind === "followers" ? "No followers yet." : "Not following anyone yet."}
          </p>
        )
      ) : null}
    </Sheet>
  );
}
