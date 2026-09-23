import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text } from 'react-native';

import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { TripCard } from '@/components/TripCard';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { Paginated, Trip } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function TripsScreen() {
  const colors = Colors[useColorScheme()];
  const { data, loading, refreshing, error, refresh } = useFetch<Paginated<Trip>>('/api/trips/');

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const trips = data?.results ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      data={trips}
      keyExtractor={(trip) => trip.id}
      renderItem={({ item }) => <TripCard trip={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
      ListHeaderComponent={
        trips.length ? (
          <Text style={[styles.header, { color: colors.muted }]}>
            {data?.count} {data?.count === 1 ? 'trip' : 'trips'}
          </Text>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState message="Plan a trip on safar.app, or get an invite code from a friend to join theirs." />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  header: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 },
});
