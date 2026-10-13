import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, PillTabs, usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { TrackComment, TrackCommentThread, TrackDetail } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/** What the discussion is narrowed to: everything, one day, or one stop. */
export type DiscussionFocus =
  | { kind: 'all' }
  | { kind: 'day'; id: number; label: string }
  | { kind: 'stop'; id: number; label: string };

/** Replies indent up to this depth; deeper ones line up with it. */
const MAX_INDENT = 3;

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
  onCounts: (counts: TrackCommentThread['counts']) => void;
}) {
  const colors = usePalette();
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const params = new URLSearchParams({ sort });
  if (focus.kind === 'day') params.set('day', String(focus.id));
  if (focus.kind === 'stop') params.set('stop', String(focus.id));
  const { data, loading, error, refresh } = useFetch<TrackCommentThread>(
    `/api/explore/tracks/${track.id}/comments/?${params.toString()}`,
  );

  useEffect(() => {
    if (data) onCounts(data.counts);
  }, [data, onCounts]);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.text }]}>
          💬 Discussion {data ? <Text style={{ color: colors.muted, fontSize: 14 }}>{data.counts.total}</Text> : null}
        </Text>
        <PillTabs
          options={[
            { value: 'top', label: 'Top' },
            { value: 'new', label: 'New' },
          ]}
          value={sort}
          onChange={setSort}
          style={{ paddingHorizontal: 0 }}
        />
      </View>

      {focus.kind !== 'all' ? (
        <View style={styles.focusRow}>
          <View style={[styles.focusChip, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
              Showing: {focus.label}
            </Text>
          </View>
          <Pressable onPress={() => onFocus({ kind: 'all' })} hitSlop={8}>
            <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 13 }}>Show everything</Text>
          </Pressable>
        </View>
      ) : null}

      <Composer
        key={focus.kind === 'all' ? 'all' : `${focus.kind}:${focus.id}`}
        track={track}
        focus={focus}
        onPosted={refresh}
      />

      {loading && !data ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {error && !data ? (
        <Pressable onPress={refresh}>
          <Text style={{ color: colors.danger, textAlign: 'center' }}>{error} Tap to retry.</Text>
        </Pressable>
      ) : null}
      {data ? (
        data.comments.length ? (
          data.comments.map((comment) => (
            <View key={comment.id} style={[styles.card, { backgroundColor: colors.card }]}>
              <CommentNode comment={comment} track={track} depth={0} onChanged={refresh} />
            </View>
          ))
        ) : (
          <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 12 }}>
            No suggestions {focus.kind === 'all' ? 'yet' : `for ${focus.label} yet`}. Been there? Share a tip.
          </Text>
        )
      ) : null}
    </View>
  );
}

function Composer({ track, focus, onPosted }: { track: TrackDetail; focus: DiscussionFocus; onPosted: () => void }) {
  const colors = usePalette();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const about = focus.kind === 'all' ? 'the whole track' : focus.label;

  async function post() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api(`/api/explore/tracks/${track.id}/comments/`, {
        method: 'POST',
        body: {
          text: text.trim(),
          ...(focus.kind === 'day' ? { day_id: focus.id } : focus.kind === 'stop' ? { stop_id: focus.id } : {}),
        },
      });
      setText('');
      onPosted();
    } catch (e) {
      Alert.alert("Couldn't post that", e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, gap: 10 }]}>
      <TextInput
        style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
        placeholder={`A suggestion about ${about} — best time, what to skip…`}
        placeholderTextColor={colors.muted}
        value={text}
        onChangeText={(t) => setText(t.slice(0, 2000))}
        multiline
      />
      <View style={styles.composerRow}>
        <Text style={{ color: colors.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
          About: {about}
        </Text>
        <Pressable
          onPress={post}
          disabled={busy || !text.trim()}
          style={[styles.postButton, { backgroundColor: colors.highlight, opacity: busy || !text.trim() ? 0.55 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onHighlight} size="small" />
          ) : (
            <Text style={{ color: colors.onHighlight, fontWeight: '800' }}>Post</Text>
          )}
        </Pressable>
      </View>
    </View>
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
  const colors = usePalette();
  const [score, setScore] = useState(comment.score);
  const [myVote, setMyVote] = useState(comment.my_vote);
  const [mode, setMode] = useState<'reply' | 'edit' | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const canVote = !comment.is_mine && !comment.is_deleted;

  async function vote(value: 1 | -1) {
    const next = myVote === value ? 0 : value;
    const before = { score, myVote };
    setScore(score - myVote + next);
    setMyVote(next);
    try {
      const result = await api<{ score: number; my_vote: -1 | 0 | 1 }>(`/api/explore/comments/${comment.id}/vote/`, {
        method: 'POST',
        body: { value: next },
      });
      setScore(result.score);
      setMyVote(result.my_vote);
    } catch (e) {
      setScore(before.score);
      setMyVote(before.myVote);
      Alert.alert("Couldn't vote", e instanceof ApiError ? e.message : 'Try again.');
    }
  }

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      if (mode === 'edit') {
        await api(`/api/explore/comments/${comment.id}/`, { method: 'PATCH', body: { text: draft.trim() } });
      } else {
        await api(`/api/explore/tracks/${track.id}/comments/`, {
          method: 'POST',
          body: { text: draft.trim(), parent_id: comment.id },
        });
      }
      setDraft('');
      setMode(null);
      onChanged();
    } catch (e) {
      Alert.alert("Couldn't save that", e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/api/explore/comments/${comment.id}/`, { method: 'DELETE' });
            onChanged();
          } catch (e) {
            Alert.alert("Couldn't delete that", e instanceof ApiError ? e.message : 'Try again.');
          }
        },
      },
    ]);
  }

  const flair = comment.stop
    ? `Day ${comment.day?.index ?? '?'} · ${comment.stop.title}`
    : comment.day
      ? `Day ${comment.day.index}`
      : null;
  const upColor = myVote === 1 ? colors.tint : colors.muted;
  const downColor = myVote === -1 ? colors.danger : colors.muted;

  return (
    <View style={styles.node}>
      <View style={styles.votes}>
        <Pressable onPress={() => vote(1)} disabled={!canVote} hitSlop={6} accessibilityLabel="Upvote" style={{ opacity: canVote ? 1 : 0.3 }}>
          <Ionicons name={myVote === 1 ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={24} color={upColor} />
        </Pressable>
        <Text style={{ fontWeight: '800', fontSize: 13, color: myVote === 1 ? colors.tint : myVote === -1 ? colors.danger : colors.text }}>
          {score}
        </Text>
        <Pressable onPress={() => vote(-1)} disabled={!canVote} hitSlop={6} accessibilityLabel="Downvote" style={{ opacity: canVote ? 1 : 0.3 }}>
          <Ionicons name={myVote === -1 ? 'arrow-down-circle' : 'arrow-down-circle-outline'} size={24} color={downColor} />
        </Pressable>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.metaRow}>
          {comment.author ? (
            <>
              <Avatar emoji={comment.author.avatar_emoji} size={24} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                {comment.author.name}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 13 }}>[deleted]</Text>
          )}
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            · {relativeTime(comment.created_at)}
            {comment.edited ? ' · edited' : ''}
          </Text>
        </View>
        {flair && depth === 0 ? (
          <View style={[styles.flair, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ color: colors.tint, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
              {flair}
            </Text>
          </View>
        ) : null}

        {mode === 'edit' ? null : (
          <Text
            style={{
              color: comment.is_deleted ? colors.muted : colors.text,
              fontStyle: comment.is_deleted ? 'italic' : 'normal',
              fontSize: 15,
              lineHeight: 21,
              marginTop: 4,
            }}
          >
            {comment.is_deleted ? 'This comment was deleted.' : comment.text}
          </Text>
        )}

        {!comment.is_deleted ? (
          <View style={styles.actions}>
            <Pressable onPress={() => { setMode(mode === 'reply' ? null : 'reply'); setDraft(''); }} hitSlop={6}>
              <Text style={[styles.action, { color: colors.muted }]}>Reply</Text>
            </Pressable>
            {comment.is_mine ? (
              <>
                <Pressable onPress={() => { setMode('edit'); setDraft(comment.text); }} hitSlop={6}>
                  <Text style={[styles.action, { color: colors.muted }]}>Edit</Text>
                </Pressable>
                <Pressable onPress={remove} hitSlop={6}>
                  <Text style={[styles.action, { color: colors.muted }]}>Delete</Text>
                </Pressable>
              </>
            ) : null}
            {comment.replies.length ? (
              <Pressable onPress={() => setCollapsed(!collapsed)} hitSlop={6}>
                <Text style={[styles.action, { color: colors.muted }]}>
                  {collapsed ? `Show ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}` : 'Hide replies'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {mode ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, minHeight: 60 }]}
              value={draft}
              onChangeText={(t) => setDraft(t.slice(0, 2000))}
              placeholder={mode === 'reply' ? `Reply to ${comment.author?.name ?? 'this comment'}…` : ''}
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={submit}
                disabled={busy || !draft.trim()}
                style={[styles.postButton, { backgroundColor: colors.highlight, opacity: busy || !draft.trim() ? 0.55 : 1 }]}
              >
                <Text style={{ color: colors.onHighlight, fontWeight: '800' }}>{mode === 'edit' ? 'Save' : 'Reply'}</Text>
              </Pressable>
              <Pressable onPress={() => setMode(null)} style={[styles.postButton, { backgroundColor: colors.raised }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {comment.replies.length && !collapsed ? (
          <View
            style={[
              { marginTop: 10, gap: 12 },
              depth < MAX_INDENT && { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 8 },
            ]}
          >
            {comment.replies.map((reply) => (
              <CommentNode key={reply.id} comment={reply} track={track} depth={depth + 1} onChanged={onChanged} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The 💬 count button the itinerary shows beside each day and stop. */
export function DiscussButton({ count, onPress, label }: { count: number; onPress: () => void; label: string }) {
  const colors = usePalette();
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label} style={[styles.discuss, { backgroundColor: colors.raised }]}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>💬 {count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headRow: { gap: 8 },
  title: { fontSize: 20, fontWeight: '800' },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  focusChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 1 },
  card: { borderRadius: 22, padding: 14 },
  input: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, minHeight: 70, textAlignVertical: 'top' },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postButton: { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', minWidth: 80 },
  node: { flexDirection: 'row', gap: 10 },
  votes: { alignItems: 'center', gap: 2, width: 30 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  flair: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  action: { fontSize: 13, fontWeight: '700' },
  discuss: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
});
