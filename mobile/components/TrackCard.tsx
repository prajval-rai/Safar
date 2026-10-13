import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Photo, usePalette } from '@/components/ui';
import { api } from '@/lib/api';
import type { Track } from '@/lib/types';

/** A published route, in the same shape as the My Trips card on the website:
 *  chips on top, the picture as a ringed circle beside the title and place,
 *  a line of facts, then the author and likes along the bottom. */
export function TrackCard({ track }: { track: Track }) {
  const colors = usePalette();
  const [liked, setLiked] = useState(track.liked);
  const [likes, setLikes] = useState(track.likes_count);

  async function toggleLike() {
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

  const facts = [
    `${track.days} ${track.days === 1 ? 'day' : 'days'}`,
    `${track.stop_count} ${track.stop_count === 1 ? 'stop' : 'stops'}`,
    track.best_season || null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => router.push(`/tracks/${track.id}`)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.chips}>
        <Chip text={`${track.days} ${track.days === 1 ? 'day' : 'days'}`} tone="brand" />
        <Chip text={track.difficulty.charAt(0).toUpperCase() + track.difficulty.slice(1)} />
        {track.estimated_cost ? <Chip text={`₹${track.estimated_cost.toLocaleString('en-IN')}`} /> : null}
      </View>

      <View style={styles.head}>
        <View style={[styles.avatarRing, { borderColor: colors.brandSoft, backgroundColor: colors.card }]}>
          <Photo uri={track.cover_image} cover={track.cover_key} style={styles.avatar} radius={30} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14 }} numberOfLines={1}>
            {track.destination}
            {track.region ? `, ${track.region}` : ''}
          </Text>
        </View>
      </View>

      <Text style={{ color: colors.muted, fontSize: 14 }} numberOfLines={1}>
        {facts.join(' · ')}
      </Text>

      {track.route.length ? (
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
          {track.route.join(' → ')}
        </Text>
      ) : track.summary ? (
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
          {track.summary}
        </Text>
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Avatar emoji={track.author.avatar_emoji} size={26} />
        <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>
          {track.author.name}
        </Text>
        <Pressable onPress={toggleLike} style={styles.like} hitSlop={8} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.tint : colors.muted} />
          <Text style={{ color: liked ? colors.tint : colors.muted, fontSize: 14, fontWeight: '700' }}>{likes}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Chip({ text, tone }: { text: string; tone?: 'brand' }) {
  const colors = usePalette();
  return (
    <View style={[styles.chip, { backgroundColor: tone === 'brand' ? colors.brandSoft : colors.raised }]}>
      <Text style={{ color: tone === 'brand' ? colors.tint : colors.muted, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 10, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 60, height: 60 },
  title: { fontSize: 18, fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6 },
});
