import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import { OpenTripCard, useJoinRequest } from '@/components/OpenTripCard';
import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { TrackCard } from '@/components/TrackCard';
import { TravelMap } from '@/components/TravelMap';
import { PillTabs, Photo, SearchBar, usePalette } from '@/components/ui';
import { dateRange } from '@/lib/format';
import type { ExplorePin, OpenTrip, Paginated, Track } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type View_ = 'map' | 'tracks' | 'trips';
const VIEWS: { value: View_; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'tracks', label: 'Tracks' },
  { value: 'trips', label: 'Open trips' },
];

/** Where to go next: every published track and open trip on a map, or as
 *  lists — one search box over all three. */
export default function ExploreScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<View_>('map');
  const [query, setQuery] = useState('');

  const top = (
    <View style={{ gap: 10 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search a destination" floating />
      </View>
      <PillTabs options={VIEWS} value={view} onChange={setView} floating />
    </View>
  );

  if (view === 'map') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ExploreMap query={query} />
        <View style={[styles.floatingTop, { top: insets.top + 10 }]} pointerEvents="box-none">
          {top}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 10 }}>
      {top}
      {view === 'tracks' ? <TracksList query={query} /> : <OpenTripsList query={query} />}
    </View>
  );
}

function ExploreMap({ query }: { query: string }) {
  const colors = usePalette();
  const path = `/api/explore/map/${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`;
  const { data, error, refresh } = useFetch<ExplorePin[]>(path, { refetchOnFocusAfter: 60_000 });
  const [selected, setSelected] = useState<string | null>(null);

  const pins = useMemo(
    () =>
      (data ?? []).map((p) => ({
        id: `${p.kind}:${p.id}`,
        latitude: p.latitude,
        longitude: p.longitude,
        image: p.image || null,
        emoji: p.kind === 'trip' ? '🧭' : '🗺️',
      })),
    [data],
  );
  const pin = (data ?? []).find((p) => `${p.kind}:${p.id}` === selected) ?? null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <TravelMap
        pins={pins}
        selectedId={selected}
        onSelect={setSelected}
        style={StyleSheet.absoluteFill}
        bottomInset={pin ? 260 : 120}
      />
      {error && !data ? (
        <View style={[styles.mapNote, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.danger, fontSize: 13, flex: 1 }}>{error}</Text>
          <Pressable onPress={refresh}>
            <Text style={{ color: colors.tint, fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      ) : data && !data.length ? (
        <View style={[styles.mapNote, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {query.trim() ? `Nothing on the map for "${query.trim()}".` : 'No tracks or open trips on the map yet.'}
          </Text>
        </View>
      ) : null}
      {pin ? <PinCard key={selected} pin={pin} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}

/** The dark card over the bottom of the map for the selected pin. */
function PinCard({ pin, onClose }: { pin: ExplorePin; onClose: () => void }) {
  const colors = usePalette();
  const join = useJoinRequest(pin.id, null);
  const isTrack = pin.kind === 'track';

  return (
    <View style={[styles.pinCard, { backgroundColor: colors.nav, bottom: TAB_BAR_SPACE - 18 }]}>
      <Photo uri={pin.image} cover={pin.cover_key} style={styles.pinPhoto} radius={18} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.pinTitleRow}>
          <Text style={styles.pinTitle} numberOfLines={2}>
            {pin.title}
          </Text>
          <Pressable
            onPress={isTrack ? () => router.push(`/tracks/${pin.id}`) : join.status ? join.withdraw : join.ask}
            disabled={join.busy}
            accessibilityLabel={isTrack ? 'Open this track' : join.status ? 'Withdraw request' : 'Ask to join'}
            style={[styles.pinGo, { backgroundColor: colors.highlight }]}
          >
            <Ionicons
              name={isTrack ? 'arrow-forward' : join.status ? 'checkmark' : 'person-add'}
              size={19}
              color={colors.onHighlight}
            />
          </Pressable>
        </View>
        <Text style={styles.pinSubtitle} numberOfLines={3}>
          {pin.subtitle}
        </Text>
        <Text style={styles.pinMeta} numberOfLines={1}>
          {isTrack ? '🗺️ Track' : `🧭 Open trip${pin.start_date ? ` · ${dateRange(pin.start_date, pin.start_date)}` : ''}`} ·{' '}
          {pin.days} {pin.days === 1 ? 'day' : 'days'} · {pin.author}
        </Text>
      </View>
      <Pressable onPress={onClose} hitSlop={10} style={styles.pinClose} accessibilityLabel="Close">
        <Ionicons name="close" size={16} color="#aaa" />
      </Pressable>
    </View>
  );
}

const REGIONS = ['All', 'Goa', 'Rajasthan', 'Himachal Pradesh', 'Kerala', 'Ladakh', 'Uttarakhand'];
type TrackScope = 'all' | 'mine' | 'saved';

function TracksList({ query }: { query: string }) {
  const colors = usePalette();
  const [scope, setScope] = useState<TrackScope>('all');
  const [region, setRegion] = useState('All');

  const path = useMemo(() => {
    if (scope === 'mine') return '/api/explore/tracks/?mine=1';
    if (scope === 'saved') return '/api/explore/tracks/?saved=1';
    const params = new URLSearchParams({ sort: 'popular' });
    if (region !== 'All') params.set('region', region);
    if (query.trim()) params.set('search', query.trim());
    return `/api/explore/tracks/?${params.toString()}`;
  }, [scope, region, query]);

  const { data, loading, refreshing, error, refresh } = useFetch<Paginated<Track>>(path, { refetchOnFocusAfter: 60_000 });

  return (
    <FlatList
      style={{ flex: 1, marginTop: 10 }}
      contentContainerStyle={styles.list}
      data={data?.results ?? []}
      keyExtractor={(track) => track.id}
      renderItem={({ item }) => <TrackCard track={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
      ListHeaderComponent={
        <View style={{ gap: 4, marginBottom: 12 }}>
          <View style={styles.scopeRow}>
            {(['all', 'mine', 'saved'] as TrackScope[]).map((s) => (
              <Pressable key={s} onPress={() => setScope(s)} hitSlop={6}>
                <Text
                  style={{
                    color: scope === s ? colors.text : colors.muted,
                    fontWeight: scope === s ? '800' : '500',
                    fontSize: 14,
                    textDecorationLine: scope === s ? 'underline' : 'none',
                  }}
                >
                  {s === 'all' ? 'Popular' : s === 'mine' ? 'Mine' : 'Saved'}
                </Text>
              </Pressable>
            ))}
          </View>
          {scope === 'all' ? (
            <PillTabs
              options={REGIONS.map((r) => ({ value: r, label: r }))}
              value={region}
              onChange={setRegion}
              style={{ paddingHorizontal: 0 }}
            />
          ) : null}
          {loading && !data ? <Loading /> : error && !data ? <ErrorState message={error} onRetry={refresh} /> : null}
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <EmptyState
            message={
              scope === 'mine'
                ? 'No tracks yet. Finish a trip, then publish it as a track others can follow.'
                : scope === 'saved'
                  ? 'Nothing saved yet. Save any track and it lands here.'
                  : 'No tracks here yet. Try another region.'
            }
          />
        ) : null
      }
    />
  );
}

function OpenTripsList({ query }: { query: string }) {
  const colors = usePalette();
  const path = `/api/explore/open-trips/${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`;
  const { data, loading, refreshing, error, refresh } = useFetch<OpenTrip[]>(path, { refetchOnFocusAfter: 60_000 });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <FlatList
      style={{ flex: 1, marginTop: 10 }}
      contentContainerStyle={styles.list}
      data={data ?? []}
      keyExtractor={(trip) => trip.id}
      renderItem={({ item }) => <OpenTripCard trip={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
      ListHeaderComponent={
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          Upcoming trips looking for travellers — ask to join and the organiser lets you in.
        </Text>
      }
      ListEmptyComponent={<EmptyState message="No upcoming trips to join right now." />}
    />
  );
}

const styles = StyleSheet.create({
  floatingTop: { position: 'absolute', left: 0, right: 0 },
  list: { paddingHorizontal: 16, paddingBottom: TAB_BAR_SPACE, flexGrow: 1 },
  scopeRow: { flexDirection: 'row', gap: 18, marginBottom: 6 },
  mapNote: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: TAB_BAR_SPACE,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 26,
    padding: 10,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  pinPhoto: { width: 120, height: 140 },
  pinTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  pinTitle: { color: '#fff', fontSize: 19, fontWeight: '700', flex: 1 },
  pinGo: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  pinSubtitle: { color: '#c9ccd1', fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  pinMeta: { color: '#9ba1a8', fontSize: 11.5, marginTop: 8 },
  pinClose: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
