import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Photo, usePalette } from '@/components/ui';
import { api } from '@/lib/api';
import type { Track } from '@/lib/types';

/** A published route as a big photo card: the title and place over the
 *  picture, the author and likes underneath. */
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

  return (
    <Pressable
      onPress={() => router.push(`/tracks/${track.id}`)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.imageWrap}>
        <Photo uri={track.cover_image} cover={track.cover_key} style={StyleSheet.absoluteFill} radius={22} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.shade} />
        <View style={[styles.daysChip, { backgroundColor: colors.highlight }]}>
          <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 12 }}>
            {track.days} {track.days === 1 ? 'day' : 'days'}
          </Text>
        </View>
        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <View style={styles.placeRow}>
            <Ionicons name="location" size={13} color="#fff" />
            <Text style={styles.place} numberOfLines={1}>
              {track.destination}
              {track.region ? `, ${track.region}` : ''}
            </Text>
          </View>
        </View>
      </View>

      {track.summary ? (
        <Text style={[styles.summary, { color: colors.muted }]} numberOfLines={2}>
          {track.summary}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Avatar emoji={track.author.avatar_emoji} size={28} />
        <Text style={[styles.author, { color: colors.text }]} numberOfLines={1}>
          {track.author.name}
        </Text>
        {track.estimated_cost ? (
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
            ₹{track.estimated_cost.toLocaleString('en-IN')}
          </Text>
        ) : null}
        <Pressable onPress={toggleLike} style={styles.likeButton} hitSlop={8} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? colors.danger : colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>{likes}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, padding: 10, marginBottom: 16 },
  imageWrap: { height: 200, borderRadius: 22, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  daysChip: { position: 'absolute', top: 12, right: 12, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  overlay: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  place: { color: '#fff', fontSize: 13, opacity: 0.95 },
  summary: { fontSize: 13, lineHeight: 19, marginTop: 10, marginHorizontal: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginHorizontal: 6, marginBottom: 4 },
  author: { flex: 1, fontSize: 13, fontWeight: '600' },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6 },
});
