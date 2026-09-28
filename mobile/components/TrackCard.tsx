import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { TripCover } from '@/components/TripCover';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { api } from '@/lib/api';
import type { Track } from '@/lib/types';

export function TrackCard({ track }: { track: Track }) {
  const colors = Colors[useColorScheme()];
  const [liked, setLiked] = useState(track.liked);
  const [likes, setLikes] = useState(track.likes_count);

  async function toggleLike() {
    // Optimistic — matches the web app's TrackCard.
    setLiked(!liked);
    setLikes((n) => n + (liked ? -1 : 1));
    try {
      const result = await api<{ liked: boolean; likes_count: number }>(`/api/explore/tracks/${track.id}/like/`, {
        method: 'POST',
      });
      setLiked(result.liked);
      setLikes(result.likes_count);
    } catch {
      setLiked(track.liked);
      setLikes(track.likes_count);
    }
  }

  return (
    <Pressable
      onPress={() => router.push(`/tracks/${track.id}`)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.body}>
        <View style={styles.chips}>
          <Chip label={`${track.days} ${track.days === 1 ? 'day' : 'days'}`} tone="brand" colors={colors} />
          <Chip label={track.difficulty} colors={colors} />
          {track.estimated_cost ? <Chip label={`₹${track.estimated_cost.toLocaleString('en-IN')}`} colors={colors} /> : null}
        </View>

        {/* Same shape as the trip card: the picture as a small circle beside the title. */}
        <View style={styles.header}>
          <View style={[styles.cover, { borderColor: colors.brandSoft }]}>
            {track.cover_image ? (
              <Image source={{ uri: track.cover_image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <TripCover cover={track.cover_key} radius={0} style={StyleSheet.absoluteFill} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={[styles.destination, { color: colors.muted }]} numberOfLines={1}>
              📍 {track.destination}
              {track.region ? `, ${track.region}` : ''}
            </Text>
          </View>
        </View>
        {track.summary ? (
          <Text style={[styles.summary, { color: colors.muted }]} numberOfLines={2}>
            {track.summary}
          </Text>
        ) : null}
        {track.route.length ? (
          <Text style={[styles.route, { color: colors.muted }]} numberOfLines={1}>
            {track.route.join(' → ')}
          </Text>
        ) : null}

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ fontSize: 13 }}>{track.author.avatar_emoji}</Text>
          </View>
          <Text style={[styles.author, { color: colors.muted }]} numberOfLines={1}>
            {track.author.name}
          </Text>
          <Pressable onPress={toggleLike} style={styles.likeButton} hitSlop={8}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.tint : colors.muted} />
            <Text style={{ color: liked ? colors.tint : colors.muted, fontSize: 13, fontWeight: '700' }}>{likes}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function Chip({ label, tone, colors }: { label: string; tone?: 'brand'; colors: (typeof Colors)['light'] }) {
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: tone === 'brand' ? colors.brandSoft : colors.raised },
      ]}
    >
      <Text style={{ color: tone === 'brand' ? colors.tint : colors.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  cover: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', borderWidth: 3 },
  destination: { fontSize: 13 },
  body: { padding: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  summary: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  route: { fontSize: 11 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  author: { flex: 1, fontSize: 12 },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 4 },
});
