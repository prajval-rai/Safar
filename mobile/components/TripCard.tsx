import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Photo, usePalette } from '@/components/ui';
import { dateRange, statusBadge } from '@/lib/format';
import type { Trip } from '@/lib/types';

/** A trip as a photo card: status on the picture, title and place over it,
 *  dates, people and progress underneath. `compact` is the narrower card
 *  used in Home's horizontal row. */
export function TripCard({ trip, onPress, compact }: { trip: Trip; onPress?: () => void; compact?: boolean }) {
  const colors = usePalette();
  const badge = statusBadge(trip.status);
  const live = trip.status === 'active';

  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/trips/${trip.id}`))}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compact,
        { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={[styles.imageWrap, compact && { height: 150 }]}>
        <Photo uri={trip.cover_image} cover={trip.cover_key} style={StyleSheet.absoluteFill} radius={22} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={styles.shade} />
        <View style={[styles.status, { backgroundColor: live ? colors.highlight : 'rgba(255,255,255,0.92)' }]}>
          <Text style={{ color: live ? colors.onHighlight : '#17191c', fontSize: 11, fontWeight: '800' }}>
            {badge.mark} {badge.label}
          </Text>
        </View>
        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={styles.placeRow}>
            <Ionicons name="location" size={13} color="#fff" />
            <Text style={styles.place} numberOfLines={1}>
              {trip.destination}
              {trip.region ? `, ${trip.region}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.meta}>
        <Meta icon="calendar-outline" text={dateRange(trip.start_date, trip.end_date)} />
        <Meta icon="people-outline" text={`${trip.member_count}`} />
        {!compact ? <Meta icon="time-outline" text={`${trip.duration_days}d`} /> : null}
      </View>

      {trip.status === 'active' || trip.status === 'planning' ? (
        <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.highlight, width: `${Math.max(4, trip.progress_percent)}%` }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: 'calendar-outline' | 'people-outline' | 'time-outline'; text: string }) {
  const colors = usePalette();
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, padding: 10, marginBottom: 16 },
  compact: { width: 250, marginBottom: 0 },
  imageWrap: { height: 180, borderRadius: 22, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  status: { position: 'absolute', top: 12, left: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  overlay: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  title: { color: '#fff', fontSize: 19, fontWeight: '800' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  place: { color: '#fff', fontSize: 13, opacity: 0.95 },
  meta: { flexDirection: 'row', gap: 14, marginTop: 10, marginHorizontal: 6, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progressTrack: { height: 6, borderRadius: 999, marginTop: 10, marginHorizontal: 6, marginBottom: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
});
