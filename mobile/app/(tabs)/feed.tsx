import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError, api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { Paginated, Person, TravelPost, Trip } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Scope = 'everyone' | 'following';

export default function FeedScreen() {
  const colors = Colors[useColorScheme()];
  const [scope, setScope] = useState<Scope>('everyone');
  const [query, setQuery] = useState('');
  const [writing, setWriting] = useState(false);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    if (scope === 'following') params.set('following', '1');
    const qs = params.toString();
    return `/api/explore/posts/${qs ? `?${qs}` : ''}`;
  }, [scope, query]);

  const { data, loading, refreshing, error, refresh } = useFetch<Paginated<TravelPost>>(path);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        data={data?.results ?? []}
        keyExtractor={(post) => post.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
        ListHeaderComponent={
          <>
            <Text style={[styles.title, { color: colors.text }]}>Feed</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Short stories and tips from people on the road.</Text>

            <Pressable onPress={() => setWriting(true)} style={[styles.writeButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.writeIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="create-outline" size={17} color={colors.tint} />
              </View>
              <Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>Share a story or tip from your travels…</Text>
            </Pressable>

            <FindTravellers />

            <View style={styles.scopeRow}>
              {(['everyone', 'following'] as Scope[]).map((s) => {
                const active = scope === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setScope(s)}
                    style={[styles.scopeChip, active && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: active ? '700' : '500', fontSize: 13, textTransform: 'capitalize' }}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search posts"
                placeholderTextColor={colors.muted}
              />
            </View>

            {loading && !data ? <Loading /> : error && !data ? <ErrorState message={error} onRetry={refresh} /> : null}
          </>
        }
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              message={
                scope === 'following'
                  ? 'Nothing from people you follow yet. Follow a few travellers above.'
                  : 'No posts yet. Tap "Write a post" and share one thing you learned.'
              }
            />
          ) : null
        }
      />

      <WritePostModal visible={writing} onClose={() => setWriting(false)} onPosted={refresh} />
    </View>
  );
}

function PostCard({ post }: { post: TravelPost }) {
  const colors = Colors[useColorScheme()];
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes_count);

  async function toggleLike() {
    setLiked(!liked);
    setLikes((n) => n + (liked ? -1 : 1));
    try {
      const result = await api<{ liked: boolean; likes_count: number }>(`/api/explore/posts/${post.id}/like/`, { method: 'POST' });
      setLiked(result.liked);
      setLikes(result.likes_count);
    } catch {
      setLiked(post.liked);
      setLikes(post.likes_count);
    }
  }

  return (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.postHeader}>
        <Pressable onPress={() => router.push(`/u/${post.author.username}`)} style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Text style={{ fontSize: 15 }}>{post.author.avatar_emoji}</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable onPress={() => router.push(`/u/${post.author.username}`)}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{post.author.name}</Text>
          </Pressable>
          {post.place ? (
            <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>📍 {post.place}</Text>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 11 }}>{relativeTime(post.created_at)}</Text>
          )}
        </View>
        <View style={[styles.levelChip, { backgroundColor: colors.brandSoft }]}>
          <Text style={{ color: colors.tint, fontSize: 11, fontWeight: '700' }}>Level {post.author.level}</Text>
        </View>
      </View>

      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21, marginTop: 10 }}>{post.caption}</Text>

      <View style={styles.postFooter}>
        <Pressable onPress={toggleLike} style={styles.likeButton} hitSlop={8}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.tint : colors.muted} />
          <Text style={{ color: liked ? colors.tint : colors.muted, fontSize: 13, fontWeight: '700' }}>{likes} likes</Text>
        </Pressable>
        {post.trip_title ? (
          <View style={[styles.tripChip, { backgroundColor: colors.raised }]}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600' }}>From {post.trip_title}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function FindTravellers() {
  const colors = Colors[useColorScheme()];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const needle = query.trim();
      if (needle.length < 2) {
        setResults(null);
        return;
      }
      api<Person[]>(`/api/users/search/?q=${encodeURIComponent(needle)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.text }]}>Find travellers to follow</Text>
      <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 8 }]}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or username"
          placeholderTextColor={colors.muted}
        />
      </View>
      {results ? (
        results.length ? (
          results.map((person) => <PersonRow key={person.id} person={person} colors={colors} />)
        ) : (
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>Nobody found for &quot;{query.trim()}&quot;.</Text>
        )
      ) : null}
    </View>
  );
}

function PersonRow({ person, colors }: { person: Person; colors: (typeof Colors)['light'] }) {
  const [following, setFollowing] = useState(person.is_following);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const result = await api<{ is_following: boolean }>(`/api/users/${person.username}/follow/`, {
        method: following ? 'DELETE' : 'POST',
      });
      setFollowing(result.is_following);
    } catch {
      // Leave the button as-is — the next tap will retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.personRow}>
      <Pressable onPress={() => router.push(`/u/${person.username}`)} style={styles.personLink}>
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Text style={{ fontSize: 15 }}>{person.avatar_emoji}</Text>
        </View>
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{person.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>@{person.username} · Level {person.level}</Text>
        </View>
      </Pressable>
      {!person.is_me ? (
        <Pressable
          onPress={toggle}
          disabled={busy}
          style={[
            styles.followButton,
            following
              ? { backgroundColor: colors.raised }
              : { backgroundColor: colors.tint },
          ]}
        >
          <Text style={{ color: following ? colors.text : colors.onBrand, fontSize: 12, fontWeight: '700' }}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function WritePostModal({ visible, onClose, onPosted }: { visible: boolean; onClose: () => void; onPosted: () => void }) {
  const colors = Colors[useColorScheme()];
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: trips } = useFetch<Paginated<Trip>>(visible ? '/api/trips/' : null);
  const [tripId, setTripId] = useState('');

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api<TravelPost>('/api/explore/posts/', {
        method: 'POST',
        body: { caption: caption.trim(), place: place.trim(), ...(tripId ? { trip: tripId } : {}) },
      });
      setCaption('');
      setPlace('');
      setTripId('');
      onPosted();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't post that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Write a post</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 14 }}>
            A story, a tip or a warning for the next traveller. Keep it short.
          </Text>

          <TextInput
            style={[styles.textarea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            value={caption}
            onChangeText={(t) => setCaption(t.slice(0, 1000))}
            placeholder="Reached Amer Fort at sunrise — no queue, no crowd, worth the 5 a.m. alarm."
            placeholderTextColor={colors.muted}
            multiline
          />
          <Text style={{ color: colors.muted, fontSize: 11, alignSelf: 'flex-end', marginTop: 4 }}>{caption.length}/1000</Text>

          <Text style={styles.label}>Place (optional)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            value={place}
            onChangeText={setPlace}
            placeholder="Jaipur, Rajasthan"
            placeholderTextColor={colors.muted}
          />

          {trips && trips.results.length > 0 ? (
            <>
              <Text style={styles.label}>From a trip (optional)</Text>
              <View style={styles.tripPickerRow}>
                <Pressable
                  onPress={() => setTripId('')}
                  style={[styles.tripOption, { borderColor: tripId === '' ? colors.tint : colors.border, backgroundColor: tripId === '' ? colors.brandSoft : colors.background }]}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>None</Text>
                </Pressable>
                {trips.results.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setTripId(t.id)}
                    style={[styles.tripOption, { borderColor: tripId === t.id ? colors.tint : colors.border, backgroundColor: tripId === t.id ? colors.brandSoft : colors.background }]}
                  >
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{t.title}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}

          <Pressable onPress={submit} disabled={busy || !caption.trim()} style={[styles.submit, { backgroundColor: colors.tint, opacity: busy || !caption.trim() ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={{ color: colors.onBrand, fontWeight: '700' }}>Post</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 14 },
  writeButton: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  writeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  cardLabel: { fontSize: 14, fontWeight: '800' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  personLink: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  followButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  scopeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  scopeChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  postCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  levelChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  postFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '85%' },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12, color: '#8a8a8a' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
  tripPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tripOption: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 160 },
  submit: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
});
