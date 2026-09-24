"use client";

import { Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/art/Motif";
import { TripCover } from "@/components/art/TripCover";
import { Avatar, Chip, ErrorNote, Skeleton } from "@/components/ui/Bits";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { api, rows } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Paginated, Track, TravelPost } from "@/lib/types";
import { formatNumber, rupees } from "@/lib/utils";

export function TrackCard({ track }: { track: Track }) {
  const [liked, setLiked] = useState(track.liked);
  const [likes, setLikes] = useState(track.likes_count);

  async function toggleLike(event: React.MouseEvent) {
    event.preventDefault();
    const result = await api.post<{ liked: boolean; likes_count: number }>(
      `/api/explore/tracks/${track.id}/like/`,
    );
    setLiked(result.liked);
    setLikes(result.likes_count);
  }

  return (
    <Link
      href={`/explore/${track.id}`}
      className="card flex h-full flex-col overflow-hidden rounded-[22px] transition-shadow hover:shadow-md"
    >
      <TripCover
        cover={track.cover_key}
        image={track.cover_image || undefined}
        alt={`${track.destination} illustration`}
        rounded={false}
        className="h-40 w-full"
      />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="brand">{track.days} days</Chip>
          <Chip>{track.difficulty}</Chip>
          {track.estimated_cost ? <Chip>{rupees(track.estimated_cost)}</Chip> : null}
        </div>
        <h3 className="text-base leading-snug font-bold text-ink">{track.title}</h3>
        <p className="line-clamp-2 text-sm text-muted">{track.summary}</p>
        {track.route.length ? (
          <p className="truncate text-xs text-muted">{track.route.join(" → ")}</p>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <Avatar user={track.author} size="sm" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{track.author.name}</span>
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            className="tap flex items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-muted hover:text-brand"
          >
            <Heart
              size={18}
              strokeWidth={1.9}
              aria-hidden="true"
              className={liked ? "fill-brand text-brand" : ""}
            />
            {formatNumber(likes)}
            <span className="sr-only-text">
              {liked ? "Unlike" : "Like"} {track.title}
            </span>
          </button>
        </div>
      </div>
    </Link>
  );
}

export function PostCard({ post }: { post: TravelPost }) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes_count);

  async function toggleLike() {
    const result = await api.post<{ liked: boolean; likes_count: number }>(
      `/api/explore/posts/${post.id}/like/`,
    );
    setLiked(result.liked);
    setLikes(result.likes_count);
  }

  return (
    <article className="card rounded-[22px] p-5">
      <div className="flex items-center gap-3">
        <Link href={`/u/${post.author.username}`} className="shrink-0 rounded-full hover:opacity-80" aria-label={`${post.author.name}'s profile`}>
          <Avatar user={post.author} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/u/${post.author.username}`}
            className="block truncate text-sm font-bold text-ink hover:text-brand hover:underline"
          >
            {post.author.name}
          </Link>
          {post.place ? (
            post.trip && post.can_open_trip ? (
              <Link
                href={`/trips/${post.trip}`}
                className="flex items-center gap-1 truncate text-xs font-semibold text-brand hover:underline"
              >
                <MapPin size={12} aria-hidden="true" /> {post.place}
              </Link>
            ) : (
              <p className="flex items-center gap-1 truncate text-xs text-muted">
                <MapPin size={12} aria-hidden="true" /> {post.place}
              </p>
            )
          ) : null}
        </div>
        <Chip tone="brand">Level {post.author.level}</Chip>
      </div>

      <ExpandableText text={post.caption} className="mt-3 text-[15px] leading-relaxed text-ink" />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          className="tap flex items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-muted hover:text-brand"
        >
          <Heart
            size={18}
            strokeWidth={1.9}
            aria-hidden="true"
            className={liked ? "fill-brand text-brand" : ""}
          />
          {formatNumber(likes)} likes
        </button>
        {post.trip_title ? (
          post.trip && post.can_open_trip ? (
            <Link href={`/trips/${post.trip}`} className="rounded-full hover:opacity-80">
              <Chip>From {post.trip_title}</Chip>
            </Link>
          ) : (
            <Chip>From {post.trip_title}</Chip>
          )
        ) : null}
      </div>
    </article>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite">
      <span className="sr-only-text">Loading…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card rounded-[22px] p-5">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="mt-5 h-4 w-2/3" />
          <Skeleton className="mt-3 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** A grid of tracks for whatever query string the caller wants. */
export function TrackGrid({
  query,
  emptyTitle,
  emptyLine,
}: {
  query: string;
  emptyTitle: string;
  emptyLine: string;
}) {
  const path = useMemo(() => `/api/explore/tracks/?${query}`, [query]);
  const { data, error, reload } = useApi<Paginated<Track>>(path);
  const tracks = rows(data);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <GridSkeleton />;
  if (!tracks.length) return <EmptyState emoji="🧭" title={emptyTitle} line={emptyLine} />;

  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {tracks.map((track) => (
        <li key={track.id}>
          <TrackCard track={track} />
        </li>
      ))}
    </ul>
  );
}

export function PostList({
  query,
  following,
  author,
}: {
  query: string;
  following?: boolean;
  author?: string;
}) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("search", query.trim());
  if (following) params.set("following", "1");
  if (author) params.set("author", author);
  const path = `/api/explore/posts/${params.toString() ? `?${params.toString()}` : ""}`;
  const { data, error, reload } = useApi<Paginated<TravelPost>>(path);
  const posts = rows(data);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <GridSkeleton />;
  if (!posts.length) {
    return (
      <EmptyState
        emoji="✍️"
        title={
          author ? "No posts yet." : following ? "Nothing from people you follow yet." : "No posts yet."
        }
        line={
          author
            ? "Stories and tips they share will show up here."
            : following
              ? "Follow a few travellers and their posts will show up here."
              : "Tap “Write a post” and share one thing you learned — that's how this fills up."
        }
      />
    );
  }

  return (
    <ul className="mx-auto max-w-2xl space-y-4">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  );
}
