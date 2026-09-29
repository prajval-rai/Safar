import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { TrackCard } from '@/components/TrackCard';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { Paginated, Track } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Same list as frontend/src/app/(app)/tracks/page.tsx's REGIONS.
const REGIONS = ['All', 'Goa', 'Rajasthan', 'Himachal Pradesh', 'Kerala', 'Ladakh', 'Uttarakhand'];

type TrackView = 'all' | 'mine' | 'saved';
const VIEWS: { value: TrackView; label: string }[] = [
  { value: 'all', label: 'All tracks' },
  { value: 'mine', label: 'Mine' },
  { value: 'saved', label: 'Saved' },
];

/** Every completed, guided route others have published — copy one and make it yours. */
export default function TracksScreen() {
  const colors = Colors[useColorScheme()];
  const [view, setView] = useState<TrackView>('all');
  const [region, setRegion] = useState('All');
  const [query, setQuery] = useState('');

  const path = useMemo(() => {
    if (view === 'mine') return '/api/explore/tracks/?mine=1';
    if (view === 'saved') return '/api/explore/tracks/?saved=1';
    const params = new URLSearchParams({ sort: 'popular' });
    if (region !== 'All') params.set('region', region);
    if (query.trim()) params.set('search', query.trim());
    return `/api/explore/tracks/?${params.toString()}`;
  }, [view, region, query]);

  const { data, loading, refreshing, error, refresh } = useFetch<Paginated<Track>>(path);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Tracks</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Guided routes from finished trips — copy one and make it yours.
        </Text>

        <View style={styles.viewRow}>
          {VIEWS.map(({ value, label }) => {
            const active = view === value;
            return (
              <Pressable
                key={value}
                onPress={() => setView(value)}
                style={[styles.viewChip, active && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: colors.text, fontWeight: active ? '700' : '500', fontSize: 13 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {view === 'all' ? (
          <>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={17} color={colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search a place or route"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
              />
            </View>
    
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={REGIONS}
              keyExtractor={(r) => r}
              contentContainerStyle={styles.regionRow}
              renderItem={({ item }) => {
                const selected = item === region;
                return (
                  <Pressable
                    onPress={() => setRegion(item)}
                    style={[
                      styles.regionChip,
                      {
                        backgroundColor: selected ? colors.tint : colors.card,
                        borderColor: selected ? colors.tint : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? colors.onBrand : colors.text, fontWeight: '600', fontSize: 13 }}>
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </>
        ) : null}
      </View>

      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          data={data?.results ?? []}
          keyExtractor={(track) => track.id}
          renderItem={({ item }) => <TrackCard track={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
          ListEmptyComponent={
            <EmptyState
              message={
                view === 'mine'
                  ? 'No tracks yet. Finish a trip, then publish it as a track others can follow.'
                  : view === 'saved'
                    ? 'Nothing saved yet. Save any track and it lands here.'
                    : 'No tracks here yet. Try another region — or finish a trip and publish the first one.'
              }
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingBottom: 0 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 14 },
  viewRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  viewChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  regionRow: { gap: 8, paddingVertical: 12 },
  regionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  list: { padding: 16, paddingTop: 4, flexGrow: 1 },
});
