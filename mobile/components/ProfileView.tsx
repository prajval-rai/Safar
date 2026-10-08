import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IndiaAchievementMap } from '@/components/IndiaAchievementMap';
import { ErrorState, Loading } from '@/components/ScreenState';
import { TravelMap } from '@/components/TravelMap';
import { Avatar, PillTabs, usePalette } from '@/components/ui';
import { CATEGORY_ICONS } from '@/lib/format';
import type { PublicProfile, TravelMapData } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Tab = 'map' | 'achievements';
const TABS: { value: Tab; label: string }[] = [
  { value: 'map', label: 'Travel map' },
  { value: 'achievements', label: 'Achievements' },
];

/**
 * A traveller's profile, yours or anyone's: the avatar and level, counts
 * (trips, followers, following), then a Travel map of every stop they've
 * checked in at, and their achievements.
 * `actions` is the button row under the name (Edit / Follow…), `footer`
 * anything after the tabs (your account settings).
 */
export function ProfileView({
  username,
  actions,
  footer,
  bottomSpace = 40,
}: {
  username: string;
  actions?: (profile: PublicProfile, set: (p: PublicProfile) => void) => ReactNode;
  footer?: ReactNode;
  bottomSpace?: number;
}) {
  const colors = usePalette();
  const [tab, setTab] = useState<Tab>('map');
  const profile = useFetch<PublicProfile>(`/api/users/${encodeURIComponent(username)}/`, { refetchOnFocusAfter: 30_000 });
  const travelMap = useFetch<TravelMapData>(`/api/users/${encodeURIComponent(username)}/travel-map/`);

  const refreshing = profile.refreshing;
  function refreshAll() {
    profile.refresh();
    travelMap.refresh();
  }

  if (profile.loading && !profile.data) return <Loading />;
  if (profile.error && !profile.data) return <ErrorState message={profile.error} onRetry={profile.refresh} />;
  if (!profile.data) return null;

  const { user } = profile.data;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: bottomSpace }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.tint} />}
    >
      <View style={styles.head}>
        <Avatar emoji={user.avatar_emoji} size={108} ring />
        <Text style={[styles.name, { color: colors.text }]}>{user.name}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>@{user.username}</Text>
        {user.home_city ? (
          <View style={styles.city}>
            <Ionicons name="location" size={13} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>{user.home_city}</Text>
          </View>
        ) : null}
        {user.bio ? <Text style={[styles.bio, { color: colors.text }]}>{user.bio}</Text> : null}

        <View style={styles.counts}>
          <Count value={profile.data.stats.trips_completed} label="Trips" />
          <Count value={profile.data.followers_count} label="Followers" />
          <Count value={profile.data.following_count} label="Following" />
        </View>

        {actions ? <View style={styles.actions}>{actions(profile.data, profile.set)}</View> : null}

        <View style={[styles.levelCard, { backgroundColor: colors.card }]}>
          <View style={styles.levelRow}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
              Level {user.level} · {user.level_name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{user.xp.toLocaleString('en-IN')} XP</Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.raised }]}>
            <View style={[styles.fill, { backgroundColor: colors.highlight, width: `${Math.max(4, user.level_progress)}%` }]} />
          </View>
          <View style={styles.statRow}>
            <MiniStat icon="flag" value={profile.data.stats.trips_completed} label="trips done" />
            <MiniStat icon="location" value={profile.data.stats.places_verified} label="places been" />
            <MiniStat icon="git-branch" value={profile.data.stats.tracks} label="tracks" />
          </View>
        </View>
      </View>

      <PillTabs options={TABS} value={tab} onChange={setTab} />

      <View style={styles.body}>
        {tab === 'map' ? <MapTab data={travelMap.data} loading={travelMap.loading && !travelMap.data} /> : null}
        {tab === 'achievements' ? (
          profile.data.achievements.length ? (
            <View style={styles.achGrid}>
              {profile.data.achievements.map((a) => (
                <View key={a.code} style={[styles.achTile, { backgroundColor: colors.card }]}>
                  <Text style={{ fontSize: 30 }}>{a.icon}</Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, textAlign: 'center' }} numberOfLines={2}>
                    {a.title}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.empty, { color: colors.muted }]}>No achievements yet — they unlock as the trips add up.</Text>
          )
        ) : null}
      </View>

      {footer}
    </ScrollView>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  const colors = usePalette();
  return (
    <View style={{ alignItems: 'center', minWidth: 72 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{value.toLocaleString('en-IN')}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function MiniStat({ icon, value, label }: { icon: 'flag' | 'location' | 'git-branch'; value: number; label: string }) {
  const colors = usePalette();
  return (
    <View style={styles.miniStat}>
      <Ionicons name={icon} size={15} color={colors.tint} />
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

/** Every stop they checked in at on the spot, as pins, and the areas their
 *  finished trips covered — then the states map. */
function MapTab({ data, loading }: { data: TravelMapData | null; loading: boolean }) {
  const colors = usePalette();
  const pins = useMemo(
    () =>
      (data?.places ?? []).map((p) => ({
        id: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        emoji: CATEGORY_ICONS[p.category] ?? '📍',
      })),
    [data],
  );
  const areas = useMemo(
    () => (data?.areas ?? []).map((a) => ({ latitude: a.latitude, longitude: a.longitude, radiusKm: a.radius_km })),
    [data],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const place = data?.places.find((p) => p.id === selected);

  if (loading) return <Loading />;
  if (!data) return null;

  return (
    <View style={{ gap: 14 }}>
      {pins.length || areas.length ? (
        <View style={[styles.mapCard, { backgroundColor: colors.card }]}>
          <TravelMap pins={pins} areas={areas} selectedId={selected} onSelect={setSelected} style={styles.map} fitPadding={30} />
          <View style={[styles.mapCaption, { backgroundColor: colors.nav }]}>
            <Ionicons name="earth" size={16} color={colors.highlight} />
            <Text style={{ color: colors.onNav, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
              {place
                ? `${place.place_name || place.title} · ${place.trip_title}`
                : `${data.places.length} places checked in · ${data.areas_covered} areas covered`}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.empty, { color: colors.muted }]}>
          Check in at stops on your trips — every place you&apos;ve really stood at lands on this map.
        </Text>
      )}
      <IndiaAchievementMap data={data} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  name: { fontSize: 24, fontWeight: '800', marginTop: 10 },
  city: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  bio: { fontSize: 14, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 20 },
  counts: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch', justifyContent: 'center' },
  levelCard: { alignSelf: 'stretch', borderRadius: 24, padding: 16, marginTop: 18, marginBottom: 14 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  body: { paddingHorizontal: 16, paddingTop: 14 },
  empty: { fontSize: 14, textAlign: 'center', marginVertical: 24, lineHeight: 20 },
  mapCard: { borderRadius: 24, overflow: 'hidden' },
  map: { height: 300 },
  mapCaption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achTile: { width: '31.5%', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 6 },
});
