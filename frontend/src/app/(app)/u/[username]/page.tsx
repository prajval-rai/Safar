"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { FollowButton } from "@/components/social/FollowButton";
import { ProfileExtras } from "@/components/social/TravelProfile";
import { Avatar, Chip, ErrorNote, LoadingBlock, Progress } from "@/components/ui/Bits";
import { ButtonLink } from "@/components/ui/Button";
import { useApi } from "@/lib/hooks";
import type { PublicProfile } from "@/lib/types";
import { formatNumber, shortDate } from "@/lib/utils";

/** Another traveller's page: who they are, whether you follow them, and where they've been. */
export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data, error, reload } = useApi<PublicProfile>(`/api/users/${encodeURIComponent(username)}/`);
  // Bumping this remounts the sections below so their follower counts refresh.
  const [version, setVersion] = useState(0);

  if (error && !data) {
    return (
      <div className="space-y-3">
        <Link href="/feed" className="text-sm font-semibold text-muted hover:text-ink">
          <span aria-hidden="true">←</span> Back
        </Link>
        <ErrorNote
          message={error.toLowerCase().includes("not found") ? "We couldn't find that traveller." : error}
          onRetry={reload}
        />
      </div>
    );
  }
  if (!data) return <LoadingBlock label="Loading profile…" />;

  const { user } = data;

  return (
    <div className="space-y-5">
      <Link href="/feed" className="inline-block text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> Back
      </Link>

      <header className="card flex flex-col items-center gap-3 p-6 text-center">
        <Avatar user={user} size="lg" />
        <div>
          <h1 className="text-xl font-extrabold text-ink">{user.name}</h1>
          <p className="text-sm text-muted">@{user.username}</p>
          {user.home_city ? (
            <p className="mt-1 text-sm text-muted">
              <span aria-hidden="true">📍</span> {user.home_city}
            </p>
          ) : null}
        </div>
        {user.bio ? <p className="max-w-sm text-sm text-ink">{user.bio}</p> : null}
        <Chip tone="brand">
          Level {user.level} · {user.level_name}
        </Chip>
        <div className="w-full max-w-sm">
          <Progress
            value={user.level_progress}
            label={`${formatNumber(user.xp)} XP · travelling since ${shortDate(user.date_joined.slice(0, 10))}`}
          />
        </div>

        {data.is_me ? (
          <ButtonLink href="/profile" variant="secondary" size="sm">
            This is you — edit profile
          </ButtonLink>
        ) : (
          <FollowButton
            key={String(data.is_following)}
            username={user.username}
            following={data.is_following}
            onChange={() => setVersion((v) => v + 1)}
          />
        )}
      </header>

      <ProfileExtras key={version} username={user.username} isMe={data.is_me} />
    </div>
  );
}
