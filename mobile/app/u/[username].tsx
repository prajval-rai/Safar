import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IndiaAchievementMap } from '@/components/IndiaAchievementMap';
import { ErrorState, Loading } from '@/components/ScreenState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { PublicProfile, TravelMapData } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function PublicProfileScreen() {
  const colors = Colors[useColorScheme()];
  const { username } = useLocalSearchParams<{ username: string }>();
  const { data, loading, error, refresh, set } = useFetch<PublicProfile>(username ? `/api/users/${username}/` : null);
  const { data: travelMap } = useFetch<TravelMapData>(username ? `/api/users/${username}/travel-map/` : null);
  const [followBusy, setFollowBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const { user } = data;

  async function toggleFollow() {
    if (!data) return;
    setFollowBusy(true);
    try {
      const result = await api<{ is_following: boolean; followers_count: number }>(`/api/users/${username}/follow/`, {
        method: data.is_following ? 'DELETE' : 'POST',
      });
      set({ ...data, is_following: result.is_following, followers_count: result.followers_count });
    } catch {
      // Leave state as-is — the button just stays clickable to retry.
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Text style={styles.avatarEmoji}>{user.avatar_emoji}</Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{user.name}</Text>
        <Text style={[styles.username, { color: colors.muted }]}>@{user.username}</Text>
        {user.home_city ? <Text style={[styles.city, { color: colors.muted }]}>📍 {user.home_city}</Text> : null}
        {user.bio ? <Text style={[styles.bio, { color: colors.text }]}>{user.bio}</Text> : null}

        <View style={[styles.levelChip, { backgroundColor: colors.brandSoft }]}>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>
            Level {user.level} · {user.level_name}
          </Text>
        </View>

        <View style={styles.followRow}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{data.followers_count}</Text> followers ·{' '}
            <Text style={{ color: colors.text, fontWeight: '800' }}>{data.following_count}</Text> following
          </Text>
        </View>

        {!data.is_me ? (
          <Pressable
            onPress={toggleFollow}
            disabled={followBusy}
            style={[
              styles.followButton,
              data.is_following ? { backgroundColor: colors.raised } : { backgroundColor: colors.tint },
            ]}
          >
            {followBusy ? (
              <ActivityIndicator size="small" color={data.is_following ? colors.text : colors.onBrand} />
            ) : (
              <Text style={{ color: data.is_following ? colors.text : colors.onBrand, fontWeight: '700', fontSize: 14 }}>
                {data.is_following ? 'Following' : 'Follow'}
              </Text>
            )}
          </Pressable>
        ) : (
          <Link href="/(tabs)/profile" style={[styles.followButton, { backgroundColor: colors.raised, alignItems: 'center' }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>This is you</Text>
          </Link>
        )}
      </View>

      <View style={styles.statGrid}>
        <StatTile value={data.stats.trips_completed} label="trips done" colors={colors} />
        <StatTile value={data.stats.places_verified} label="places stood at" colors={colors} />
        <StatTile value={data.stats.tracks} label="tracks made" colors={colors} />
      </View>

      {data.achievements.length ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.text }]}>Achievements</Text>
          <View style={styles.achievementGrid}>
            {data.achievements.map((a) => (
              <View key={a.code} style={[styles.achievementPill, { backgroundColor: colors.raised }]}>
                <Text style={{ fontSize: 15 }}>{a.icon}</Text>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{a.title}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={styles.cardLabel}>Traveller since</Text>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>
          {shortDate(user.date_joined.slice(0, 10))}
        </Text>
      </View>

      {travelMap ? <IndiaAchievementMap data={travelMap} /> : null}
    </ScrollView>
  );
}

function StatTile({ value, label, colors }: { value: number; label: string; colors: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  header: { alignItems: 'center', borderWidth: 1, borderRadius: 20, padding: 24, gap: 6 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarEmoji: { fontSize: 34 },
  name: { fontSize: 20, fontWeight: '800' },
  username: { fontSize: 13 },
  city: { fontSize: 13 },
  bio: { fontSize: 13, textAlign: 'center', marginTop: 2, maxWidth: 280 },
  levelChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginTop: 6 },
  followRow: { marginTop: 8 },
  followButton: { borderRadius: 999, paddingHorizontal: 24, paddingVertical: 11, marginTop: 12 },

  statGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statTile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },

  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: '#8a8a8a' },
  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  achievementPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
