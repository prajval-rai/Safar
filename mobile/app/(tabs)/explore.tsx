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

// Same list as frontend/src/app/(app)/explore/page.tsx's REGIONS.
const REGIONS = ['All', 'Goa', 'Rajasthan', 'Himachal Pradesh', 'Kerala', 'Ladakh', 'Uttarakhand'];

export default function ExploreScreen() {
  const colors = Colors[useColorScheme()];
  const [region, setRegion] = useState('All');
  const [query, setQuery] = useState('');

  const path = useMemo(() => {
    const params = new URLSearchParams({ sort: 'popular' });
    if (region !== 'All') params.set('region', region);
    if (query.trim()) params.set('search', query.trim());
    return `/api/explore/tracks/?${params.toString()}`;
  }, [region, query]);

  const { data, loading, refreshing, error, refresh } = useFetch<Paginated<Track>>(path);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Explore</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Routes other travellers have already done — copy one and make it yours.
        </Text>

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
            <EmptyState message="No tracks here yet. Try another region — or finish a trip and publish the first one." />
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
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  regionRow: { gap: 8, paddingVertical: 12 },
  regionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  list: { padding: 16, paddingTop: 4, flexGrow: 1 },
});
