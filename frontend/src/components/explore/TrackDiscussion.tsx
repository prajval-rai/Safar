"use client";

import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { Avatar, ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { TrackComment, TrackCommentThread, TrackDetail } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

/** What the discussion is narrowed to: everything, one day, or one stop. */
export type DiscussionFocus =
  | { kind: "all" }
  | { kind: "day"; id: number; label: string }
  | { kind: "stop"; id: number; label: string };

/** Replies indent up to this depth; deeper ones line up with it. */
const MAX_INDENT = 4;

/**
 * Reddit-style discussion under a track: suggestions about the whole route, a
 * day or a stop, voted up or down, with threaded replies. `focus` narrows it
 * (the itinerary's 💬 buttons set it); `onCounts` hands the per-day and
 * per-stop counts back up so the itinerary can show them.
 */
export function TrackDiscussion({
  track,
  focus,
  onFocus,
  onCounts,
}: {
  track: TrackDetail;
  focus: DiscussionFocus;
  onFocus: (focus: DiscussionFocus) => void;
  onCounts: (counts: TrackCommentThread["counts"]) => void;
}) {
  const [sort, setSort] = useState<"top" | "new">("top");
  const params = new URLSearchParams({ sort });
  if (focus.kind === "day") params.set("day", String(focus.id));
  if (focus.kind === "stop") params.set("stop", String(focus.id));
  const { data, loading, error, reload } = useApi<TrackCommentThread>(
    `/api/explore/tracks/${track.id}/comments/?${params}`,
  );

  useEffect(() => {
    if (data) onCounts(data.counts);
  }, [data, onCounts]);

  return (
    <section id="discussion" aria-labelledby="discussion-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="discussion-heading" className="flex items-center gap-2 text-lg font-bold text-ink">
          <MessageCircle size={20} aria-hidden="true" /> Discussion
          {data ? <span className="text-sm font-semibold text-muted">{data.counts.total}</span> : null}
        </h2>
        <div className="flex gap-1.5">
          {(["top", "new"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              aria-pressed={sort === value}
              className={cn(
                "min-h-[34px] rounded-full border px-3 text-sm font-semibold capitalize",
                sort === value ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink hover:bg-raised",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {focus.kind !== "all" ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-brand-soft px-3 py-1 font-semibold text-brand">
            Showing: {focus.label}
          </span>
          <button type="button" onClick={() => onFocus({ kind: "all" })} className="font-semibold text-muted hover:text-ink">
            Show everything
          </button>
        </div>
      ) : null}

      {/* Keyed by the focus: picking a stop's 💬 starts a comment about that stop. */}
      <Composer
        key={focus.kind === "all" ? "all" : `${focus.kind}:${focus.id}`}
        track={track}
        focus={focus}
        onPosted={reload}
      />

      {loading && !data ? <LoadingBlock /> : null}
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}
      {data ? (
        data.comments.length ? (
          <ul className="space-y-3">
            {data.comments.map((comment) => (
              <li key={comment.id} className="card p-4">
                <CommentNode comment={comment} track={track} depth={0} onChanged={reload} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="card p-6 text-center text-sm text-muted">
            No suggestions {focus.kind === "all" ? "yet" : `for ${focus.label} yet`}. Been there? Share a tip.
          </p>
        )
      ) : null}
    </section>
  );
}

/** Where a new comment is about: the whole track, a day, or a stop. */
function aboutOptions(track: TrackDetail) {
  const options: { value: string; label: string }[] = [{ value: "", label: "The whole track" }];
  for (const day of track.track_days) {
    options.push({ value: `day:${day.id}`, label: `Day ${day.index}` });
    for (const stop of day.stops) options.push({ value: `stop:${stop.id}`, label: `Day ${day.index} · ${stop.title}` });
  }
  return options;
}

function Composer({ track, focus, onPosted }: { track: TrackDetail; focus: DiscussionFocus; onPosted: () => void }) {
  const { toast } = useCelebration();
  const [text, setText] = useState("");
  const [about, setAbout] = useState(focus.kind === "all" ? "" : `${focus.kind}:${focus.id}`);
  const [busy, setBusy] = useState(false);

  async function post() {
    if (!text.trim()) return;
    setBusy(true);
    const [kind, id] = about.split(":");
    try {
      await api.post(`/api/explore/tracks/${track.id}/comments/`, {
        text: text.trim(),
        ...(kind === "day" ? { day_id: Number(id) } : kind === "stop" ? { stop_id: Number(id) } : {}),
      });
      setText("");
      onPosted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't post that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-2 p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder="Share a suggestion — the best time to go, what to skip, a better stop…"
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted focus:border-brand focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
          About
          <select
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            className="min-h-[36px] max-w-[60vw] rounded-lg border border-line bg-surface px-2 text-sm text-ink"
          >
            {aboutOptions(track).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={post} disabled={busy || !text.trim()}>
          {busy ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}

function CommentNode({
  comment,
  track,
  depth,
  onChanged,
}: {
  comment: TrackComment;
  track: TrackDetail;
  depth: number;
  onChanged: () => void;
}) {
  const { toast } = useCelebration();
  const [score, setScore] = useState(comment.score);
  const [myVote, setMyVote] = useState(comment.my_vote);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function vote(value: 1 | -1) {
    const next = myVote === value ? 0 : value;
    const before = { score, myVote };
    setScore(score - myVote + next);
    setMyVote(next);
    try {
      const result = await api.post<{ score: number; my_vote: -1 | 0 | 1 }>(`/api/explore/comments/${comment.id}/vote/`, {
        value: next,
      });
      setScore(result.score);
      setMyVote(result.my_vote);
    } catch (err) {
      setScore(before.score);
      setMyVote(before.myVote);
      toast(err instanceof ApiError ? err.message : "Couldn't vote.", "error");
    }
  }

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/api/explore/comments/${comment.id}/`, { text: draft.trim() });
      } else {
        await api.post(`/api/explore/tracks/${track.id}/comments/`, { text: draft.trim(), parent_id: comment.id });
      }
      setDraft("");
      setReplying(false);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await api.del(`/api/explore/comments/${comment.id}/`);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete that.", "error");
    }
  }

  const flair = comment.stop
    ? `Day ${comment.day?.index ?? "?"} · ${comment.stop.title}`
    : comment.day
      ? `Day ${comment.day.index}`
      : null;

  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center" aria-label={`Score ${score}`}>
        <button
          type="button"
          onClick={() => vote(1)}
          disabled={comment.is_mine || comment.is_deleted}
          aria-label="Upvote"
          aria-pressed={myVote === 1}
          className={cn("rounded-md p-0.5 disabled:opacity-30", myVote === 1 ? "text-brand" : "text-muted hover:text-ink")}
        >
          <ChevronUp size={22} />
        </button>
        <span className={cn("text-sm font-bold", myVote === 1 ? "text-brand" : myVote === -1 ? "text-danger" : "text-ink")}>
          {score}
        </span>
        <button
          type="button"
          onClick={() => vote(-1)}
          disabled={comment.is_mine || comment.is_deleted}
          aria-label="Downvote"
          aria-pressed={myVote === -1}
          className={cn("rounded-md p-0.5 disabled:opacity-30", myVote === -1 ? "text-danger" : "text-muted hover:text-ink")}
        >
          <ChevronDown size={22} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {comment.author ? (
            <>
              <Avatar user={comment.author} size="sm" />
              <span className="font-semibold text-ink">{comment.author.name}</span>
            </>
          ) : (
            <span className="font-semibold text-muted">[deleted]</span>
          )}
          <span className="text-muted">· {relativeTime(comment.created_at)}</span>
          {comment.edited ? <span className="text-muted">· edited</span> : null}
          {flair && depth === 0 ? (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{flair}</span>
          ) : null}
        </div>

        {editing ? null : (
          <p className={cn("mt-1 text-[15px] whitespace-pre-line", comment.is_deleted ? "italic text-muted" : "text-ink")}>
            {comment.is_deleted ? "This comment was deleted." : comment.text}
          </p>
        )}

        {!comment.is_deleted ? (
          <div className="mt-1.5 flex flex-wrap gap-3 text-sm font-semibold text-muted">
            <button type="button" onClick={() => { setReplying(!replying); setEditing(false); setDraft(""); }} className="hover:text-ink">
              Reply
            </button>
            {comment.is_mine ? (
              <>
                <button type="button" onClick={() => { setEditing(true); setReplying(false); setDraft(comment.text); }} className="hover:text-ink">
                  Edit
                </button>
                <button type="button" onClick={remove} className="hover:text-danger">
                  Delete
                </button>
              </>
            ) : null}
            {comment.replies.length ? (
              <button type="button" onClick={() => setCollapsed(!collapsed)} className="hover:text-ink">
                {collapsed ? `Show ${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}` : "Hide replies"}
              </button>
            ) : null}
          </div>
        ) : null}

        {replying || editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
              rows={2}
              autoFocus
              placeholder={editing ? "" : `Reply to ${comment.author?.name ?? "this comment"}…`}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] text-ink focus:border-brand focus:outline-none"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={busy || !draft.trim()}>
                {busy ? "Saving…" : editing ? "Save" : "Reply"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setReplying(false); setEditing(false); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {comment.replies.length && !collapsed ? (
          <ul className={cn("mt-3 space-y-3", depth < MAX_INDENT && "border-l-2 border-line pl-3")}>
            {comment.replies.map((reply) => (
              <li key={reply.id}>
                <CommentNode comment={reply} track={track} depth={depth + 1} onChanged={onChanged} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
