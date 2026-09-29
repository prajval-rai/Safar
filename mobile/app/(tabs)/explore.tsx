import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { TripCover } from '@/components/TripCover';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError, api } from '@/lib/api';
import { TRIP_TYPE_LABELS, dateRange, rupees } from '@/lib/format';
import type { OpenTrip } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/** Upcoming trips anyone can ask to join — the organiser approves each request.
 *  Finished routes to copy live under Tracks. */
export default function ExploreScreen() {
  const colors = Colors[useColorScheme()];
  const [query, setQuery] = useState('');

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    return `/api/explore/open-trips/?${params.toString()}`;
  }, [query]);

  const { data, loading, refreshing, error, refresh } = useFetch<OpenTrip[]>(path);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Explore</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Upcoming trips looking for travellers — ask to join and the organiser will let you in.
        </Text>

        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search a place or trip"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          data={data ?? []}
          keyExtractor={(trip) => trip.id}
          renderItem={({ item }) => <OpenTripCard trip={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
          ListEmptyComponent={
            <EmptyState message="No upcoming trips to join right now. Planning one? Let anyone ask to join from its settings on the website." />
          }
        />
      )}
    </View>
  );
}

function OpenTripCard({ trip }: { trip: OpenTrip }) {
  const colors = Colors[useColorScheme()];
  const [requested, setRequested] = useState(trip.request_status);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    try {
      await api(`/api/explore/open-trips/${trip.id}/join/`, { method: 'POST' });
      setRequested('pending');
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
      await api(`/api/explore/open-trips/${trip.id}/join/`, { method: 'DELETE' });
      setRequested(null);
    } catch (e) {
      Alert.alert("Couldn't withdraw that request", e instanceof ApiError ? e.message : 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  let action: React.ReactNode;
  if (trip.is_member) {
    action = (
      <Pressable
        onPress={() => router.push(`/trips/${trip.id}`)}
        style={[styles.button, { backgroundColor: colors.raised }]}
      >
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Open</Text>
      </Pressable>
    );
  } else if (requested === 'pending') {
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
  } else if (requested === 'declined') {
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
        style={[styles.button, { backgroundColor: colors.tint, opacity: busy ? 0.6 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onBrand} size="small" />
        ) : (
          <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 13 }}>Request to join</Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { borderColor: colors.brandSoft }]}>
          {trip.cover_image ? (
            <Image source={{ uri: trip.cover_image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <TripCover cover={trip.cover_key} radius={0} style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {trip.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
            📍 {trip.destination}
            {trip.region ? `, ${trip.region}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        <Chip text={dateRange(trip.start_date, trip.end_date)} colors={colors} brand />
        <Chip text={`${trip.member_count} going`} colors={colors} />
        <Chip text={TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type} colors={colors} />
        {trip.budget_per_person ? <Chip text={`${rupees(trip.budget_per_person)} / person`} colors={colors} /> : null}
      </View>

      {trip.summary ? (
        <Text style={{ color: colors.text, fontSize: 13, marginTop: 8 }} numberOfLines={2}>
          {trip.summary}
        </Text>
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={{ color: colors.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
          {trip.organiser.avatar_emoji} by {trip.organiser.name}
        </Text>
        {action}
      </View>
    </View>
  );
}

function Chip({ text, colors, brand }: { text: string; colors: (typeof Colors)['light']; brand?: boolean }) {
  return (
    <View style={[styles.chip, { backgroundColor: brand ? colors.brandSoft : colors.raised }]}>
      <Text style={{ color: brand ? colors.tint : colors.muted, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 14 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  list: { padding: 16, paddingTop: 4, flexGrow: 1 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', borderWidth: 3 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, maxWidth: '100%' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  button: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, minWidth: 110, alignItems: 'center' },
});
