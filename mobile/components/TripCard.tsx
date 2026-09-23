import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TripCover } from '@/components/TripCover';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { dateRange, statusBadge, TRIP_TYPE_LABELS } from '@/lib/format';
import type { Trip } from '@/lib/types';

export function TripCard({ trip, onPress }: { trip: Trip; onPress?: () => void }) {
  const colors = Colors[useColorScheme()];
  const badge = statusBadge(trip.status);
  const statusColor = trip.status === 'active' ? colors.success : trip.status === 'completed' ? colors.tint : colors.muted;

  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/trips/${trip.id}`))}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <TripCover cover={trip.cover_key} radius={0} style={styles.cover} />

      <View style={styles.body}>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: statusColor === colors.muted ? colors.raised : `${statusColor}22` }]}>
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>
              {badge.mark} {badge.label}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.raised }]}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>
              {TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type}
            </Text>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {trip.title}
        </Text>
        <Text style={[styles.destination, { color: colors.muted }]} numberOfLines={1}>
          📍 {trip.destination}
          {trip.region ? `, ${trip.region}` : ''}
        </Text>

        <Text style={[styles.meta, { color: colors.muted }]}>
          {dateRange(trip.start_date, trip.end_date)} · {trip.duration_days} {trip.duration_days === 1 ? 'day' : 'days'}
          {' · '}
          {trip.member_count} {trip.member_count === 1 ? 'traveller' : 'travellers'}
        </Text>

        {trip.status === 'active' || trip.status === 'planning' ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${Math.max(4, trip.progress_percent)}%` }]} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  cover: { height: 110 },
  body: { padding: 14 },
  chips: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  destination: { fontSize: 13, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 8 },
  progressTrack: { height: 6, borderRadius: 999, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
});
