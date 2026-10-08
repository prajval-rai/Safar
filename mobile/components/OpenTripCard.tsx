import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Photo, usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { TRIP_TYPE_LABELS, dateRange, rupees } from '@/lib/format';
import type { OpenTrip } from '@/lib/types';

/** Ask to join an open trip, or withdraw the request. Shared by the card and
 *  the map's pin card. */
export function useJoinRequest(tripId: string, initial: OpenTrip['request_status']) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    try {
      await api(`/api/explore/open-trips/${tripId}/join/`, { method: 'POST' });
      setStatus('pending');
      Alert.alert('Request sent', "You'll hear when the organiser answers.");
    } catch (e) {
      Alert.alert("Couldn't send that request", e instanceof ApiError ? e.message : 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      await api(`/api/explore/open-trips/${tripId}/join/`, { method: 'DELETE' });
      setStatus(null);
    } catch (e) {
      Alert.alert("Couldn't withdraw that request", e instanceof ApiError ? e.message : 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return { status, busy, ask, withdraw };
}

export function OpenTripCard({ trip }: { trip: OpenTrip }) {
  const colors = usePalette();
  const { status, busy, ask, withdraw } = useJoinRequest(trip.id, trip.request_status);

  let action: React.ReactNode;
  if (trip.is_member) {
    action = (
      <Pressable onPress={() => router.push(`/trips/${trip.id}`)} style={[styles.button, { backgroundColor: colors.raised }]}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Open trip</Text>
      </Pressable>
    );
  } else if (status === 'pending') {
    action = (
      <Pressable
        onPress={withdraw}
        disabled={busy}
        accessibilityLabel="Withdraw your request"
        style={[styles.button, { backgroundColor: colors.raised, opacity: busy ? 0.6 : 1 }]}
      >
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Requested ✓</Text>
      </Pressable>
    );
  } else if (status === 'declined') {
    action = (
      <View style={[styles.button, { backgroundColor: colors.dangerSoft }]}>
        <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Not accepted</Text>
      </View>
    );
  } else {
    action = (
      <Pressable
        onPress={ask}
        disabled={busy}
        style={[styles.button, { backgroundColor: colors.highlight, opacity: busy ? 0.6 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onHighlight} size="small" />
        ) : (
          <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 13 }}>Ask to join</Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.imageWrap}>
        <Photo uri={trip.cover_image} cover={trip.cover_key} style={StyleSheet.absoluteFill} radius={22} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.shade} />
        <View style={[styles.dateChip, { backgroundColor: colors.highlight }]}>
          <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 12 }}>
            {dateRange(trip.start_date, trip.end_date)}
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

      <View style={styles.chips}>
        <Chip text={`${trip.member_count} going`} />
        <Chip text={TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type} />
        {trip.budget_per_person ? <Chip text={`${rupees(trip.budget_per_person)} / person`} /> : null}
      </View>

      {trip.summary ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginHorizontal: 6, marginTop: 6 }} numberOfLines={2}>
          {trip.summary}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Avatar emoji={trip.organiser.avatar_emoji} size={28} />
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {trip.organiser.name}
        </Text>
        {action}
      </View>
    </View>
  );
}

function Chip({ text }: { text: string }) {
  const colors = usePalette();
  return (
    <View style={[styles.chip, { backgroundColor: colors.raised }]}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, padding: 10, marginBottom: 16 },
  imageWrap: { height: 180, borderRadius: 22, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  dateChip: { position: 'absolute', top: 12, right: 12, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  overlay: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  place: { color: '#fff', fontSize: 13, opacity: 0.95 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginHorizontal: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginHorizontal: 6, marginBottom: 4 },
  button: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, minWidth: 110, alignItems: 'center' },
});
