import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ExperiencePrompt } from '@/components/ExperiencePrompt';
import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import { JoinTripModal } from '@/components/JoinTripModal';
import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { TripCard } from '@/components/TripCard';
import { Photo, PillTabs, usePalette } from '@/components/ui';
import { dateRange } from '@/lib/format';
import type { HomeData, Paginated, Trip, TripStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Filter = 'all' | TripStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Live' },
  { value: 'planning', label: 'Upcoming' },
  { value: 'completed', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** The app's main screen: the trip you're on right now, a way to join a
 *  friend's with their code, and every trip you're part of. */
export default function TripsScreen() {
  const colors = usePalette();
  const [filter, setFilter] = useState<Filter>('all');
  const [joinOpen, setJoinOpen] = useState(false);
  const trips = useFetch<Paginated<Trip>>('/api/trips/', { refetchOnFocusAfter: 15_000 });
  // For the live trip and the "How was your trip?" prompt.
  const home = useFetch<HomeData>('/api/home/', { refetchOnFocusAfter: 15_000 });

  const list = useMemo(
    () => (trips.data?.results ?? []).filter((t) => filter === 'all' || t.status === filter),
    [trips.data, filter],
  );
  const live = home.data?.live_trip ?? null;

  function refresh() {
    trips.refresh();
    home.refresh();
  }

  if (trips.loading && !trips.data) return <Loading />;
  if (trips.error && !trips.data) return <ErrorState message={trips.error} onRetry={trips.refresh} />;

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.container}
        data={list}
        keyExtractor={(trip) => trip.id}
        renderItem={({ item }) => <TripCard trip={item} />}
        refreshControl={<RefreshControl refreshing={trips.refreshing} onRefresh={refresh} tintColor={colors.tint} />}
        initialNumToRender={5}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 14 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>My trips</Text>
              <Pressable onPress={() => setJoinOpen(true)} style={[styles.join, { backgroundColor: colors.highlight }]}>
                <Ionicons name="ticket-outline" size={17} color={colors.onHighlight} />
                <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 14 }}>Join with code</Text>
              </Pressable>
            </View>

            {(home.data?.checklist_due ?? []).map((due) => (
              <ChecklistDue key={due.trip_id} due={due} />
            ))}

            {live ? <LiveTrip trip={live} /> : null}

            <PillTabs options={FILTERS} value={filter} onChange={setFilter} style={{ paddingHorizontal: 0 }} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            message={
              filter === 'all'
                ? 'No trips yet. Ask a friend for their trip code and tap “Join with code” — or plan one on the website.'
                : 'Nothing here.'
            }
          />
        }
      />

      {home.data?.experience_prompt ? (
        <ExperiencePrompt
          key={home.data.experience_prompt.trip.id}
          trip={home.data.experience_prompt.trip}
          xpEarned={home.data.experience_prompt.xp_earned}
          colors={colors}
          onDone={refresh}
        />
      ) : null}

      <JoinTripModal visible={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}

/** A trip coming up (or on now) where you still have checklist items to
 *  tick — first thing on the screen, opening straight to the checklist. */
function ChecklistDue({ due }: { due: HomeData['checklist_due'][number] }) {
  const colors = usePalette();
  const days = Math.round((new Date(due.start_date).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  const when = days <= 0 ? 'is on now' : days === 1 ? 'starts tomorrow' : `starts in ${days} days`;
  return (
    <Pressable
      onPress={() => router.push(`/trips/${due.trip_id}?tab=checklist`)}
      style={[styles.due, { backgroundColor: colors.highlight }]}
    >
      <View style={[styles.dueIcon, { backgroundColor: colors.onHighlight }]}>
        <Ionicons name="checkbox-outline" size={22} color={colors.highlight} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
          Check your list first · {due.pending} left
        </Text>
        <Text style={{ color: colors.onHighlight, fontSize: 12, opacity: 0.8, marginTop: 2 }} numberOfLines={2}>
          {due.title} {when}. Still to sort: {due.items.join(', ')}
          {due.pending > due.items.length ? '…' : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.onHighlight} />
    </Pressable>
  );
}

/** The trip you're on right now, big, at the top. */
function LiveTrip({ trip }: { trip: Trip }) {
  const colors = usePalette();
  return (
    <Pressable onPress={() => router.push(`/trips/${trip.id}`)} style={[styles.live, { backgroundColor: colors.card }]}>
      <View style={styles.liveImage}>
        <Photo uri={trip.cover_image} cover={trip.cover_key} style={StyleSheet.absoluteFill} radius={22} />
        <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} />
        <View style={[styles.liveChip, { backgroundColor: colors.highlight }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.onHighlight }]} />
          <Text style={{ color: colors.onHighlight, fontSize: 11, fontWeight: '800' }}>Happening now</Text>
        </View>
        <View style={styles.liveText}>
          <Text style={styles.liveTitle} numberOfLines={1}>
            {trip.title}
          </Text>
          <Text style={styles.liveSubtitle} numberOfLines={1}>
            {trip.destination} · {dateRange(trip.start_date, trip.end_date)}
          </Text>
        </View>
      </View>
      <View style={styles.liveFooter}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{trip.progress_percent}% of the plan done</Text>
          <View style={[styles.track, { backgroundColor: colors.raised }]}>
            <View style={[styles.fill, { backgroundColor: colors.highlight, width: `${Math.max(4, trip.progress_percent)}%` }]} />
          </View>
        </View>
        <View style={[styles.go, { backgroundColor: colors.highlight }]}>
          <Ionicons name="arrow-forward" size={19} color={colors.onHighlight} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: TAB_BAR_SPACE, flexGrow: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  join: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 14 },
  dueIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  live: { borderRadius: 28, padding: 10 },
  liveImage: { height: 180, borderRadius: 22, overflow: 'hidden' },
  liveChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  liveTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  liveSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
  liveFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 },
  track: { height: 7, borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 999 },
  go: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
