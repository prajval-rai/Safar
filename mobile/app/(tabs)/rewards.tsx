import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { shortDate } from '@/lib/format';
import type { Achievement, LeaderboardRow, RewardsMe } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type RewardsView = 'achievements' | 'activity' | 'leaderboard';
const VIEWS: { value: RewardsView; label: string }[] = [
  { value: 'achievements', label: 'Achievements' },
  { value: 'activity', label: 'Recent XP' },
  { value: 'leaderboard', label: 'Leaderboard' },
];

export default function RewardsScreen() {
  const colors = Colors[useColorScheme()];
  const [view, setView] = useState<RewardsView>('achievements');
  const { data, loading, refreshing, error, refresh } = useFetch<RewardsMe>('/api/rewards/me/');
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const { user } = data;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
    >
      <View style={[styles.levelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.levelKicker, { color: colors.muted }]}>LEVEL {user.level}</Text>
        <Text style={[styles.levelName, { color: colors.tint }]}>{user.level_name}</Text>
        <Text style={[styles.xpText, { color: colors.muted }]}>
          {user.xp_into_level.toLocaleString('en-IN')} / {user.xp_for_next_level.toLocaleString('en-IN')} XP to level{' '}
          {user.level + 1}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${Math.max(4, user.level_progress)}%` }]} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.totalLine, { color: colors.muted }]}>
          <Text style={{ fontWeight: '800', color: colors.text }}>{user.xp.toLocaleString('en-IN')} XP</Text> earned in
          total · <Text style={{ fontWeight: '800', color: colors.text }}>{data.unlocked_count}/{data.total_count}</Text>{' '}
          achievements
        </Text>
      </View>

      <View style={styles.tabs}>
        {VIEWS.map((v) => {
          const selected = v.value === view;
          return (
            <Pressable
              key={v.value}
              onPress={() => setView(v.value)}
              style={[styles.tab, selected && { backgroundColor: colors.card }]}
            >
              <Text style={{ color: colors.text, fontWeight: selected ? '700' : '500', fontSize: 13 }}>{v.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {view === 'achievements' ? (
        data.achievements.map((a) => <AchievementRow key={a.code} achievement={a} colors={colors} />)
      ) : null}

      {view === 'activity' ? (
        data.recent.length ? (
          <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {data.recent.map((entry, i) => (
              <View
                key={entry.id}
                style={[styles.listRow, i < data.recent.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>{entry.reason}</Text>
                  <Text style={[styles.listMeta, { color: colors.muted }]}>
                    {entry.trip_title ? `${entry.trip_title} · ` : ''}
                    {shortDate(entry.created_at.slice(0, 10))}
                  </Text>
                </View>
                <Text style={{ color: entry.amount >= 0 ? colors.success : colors.muted, fontWeight: '800', fontSize: 13 }}>
                  {entry.amount >= 0 ? '+' : ''}{entry.amount} XP
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState message="Complete an activity on a trip and your XP will show up here." />
        )
      ) : null}

      {view === 'leaderboard' ? <Leaderboard colors={colors} /> : null}
    </ScrollView>
  );
}

function AchievementRow({ achievement, colors }: { achievement: Achievement; colors: (typeof Colors)['light'] }) {
  const progress = Math.min(1, achievement.current / achievement.goal_value);
  return (
    <View
      style={[
        styles.achievement,
        {
          backgroundColor: achievement.unlocked ? colors.brandSoft : colors.card,
          borderColor: achievement.unlocked ? colors.tint : colors.border,
        },
      ]}
    >
      <View style={[styles.achievementIcon, { backgroundColor: achievement.unlocked ? colors.card : colors.raised, opacity: achievement.unlocked ? 1 : 0.6 }]}>
        <Text style={{ fontSize: 22 }}>{achievement.icon}</Text>
      </View>
      <View style={styles.achievementBody}>
        <View style={styles.achievementTitleRow}>
          <Text style={[styles.achievementTitle, { color: colors.text }]}>{achievement.title}</Text>
          {achievement.unlocked ? (
            <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>✓ Unlocked</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: colors.raised }]}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>+{achievement.xp_reward} XP</Text>
            </View>
          )}
        </View>
        <Text style={[styles.achievementDesc, { color: colors.muted }]}>{achievement.description}</Text>
        {!achievement.unlocked ? (
          <View style={styles.achievementProgress}>
            <View style={[styles.progressTrack, styles.smallTrack, { backgroundColor: colors.raised }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${progress * 100}%` }]} />
            </View>
            <Text style={[styles.achievementProgressLabel, { color: colors.muted }]}>
              {achievement.current} of {achievement.goal_value}
            </Text>
          </View>
        ) : achievement.unlocked_at ? (
          <Text style={[styles.earnedAt, { color: colors.muted }]}>Earned {shortDate(achievement.unlocked_at.slice(0, 10))}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Leaderboard({ colors }: { colors: (typeof Colors)['light'] }) {
  const { data, loading, error, refresh } = useFetch<LeaderboardRow[]>('/api/rewards/leaderboard/');
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {(data ?? []).map((row, i) => (
        <View
          key={row.id}
          style={[
            styles.listRow,
            row.is_me && { backgroundColor: colors.brandSoft },
            i < (data?.length ?? 0) - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.rank, { color: colors.muted }]}>{row.rank}</Text>
          <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ fontSize: 14 }}>{row.avatar_emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
              {row.name} {row.is_me ? <Text style={{ color: colors.tint, fontSize: 12 }}>(you)</Text> : null}
            </Text>
            <Text style={[styles.listMeta, { color: colors.muted }]}>Level {row.level}</Text>
          </View>
          <Text style={{ color: colors.tint, fontWeight: '800', fontSize: 13 }}>{row.xp.toLocaleString('en-IN')} XP</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  levelCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 16 },
  levelKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  levelName: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  xpText: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden', width: '100%', maxWidth: 280 },
  smallTrack: { height: 5, marginTop: 0, flex: 1 },
  progressFill: { height: '100%', borderRadius: 999 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%', marginVertical: 14 },
  totalLine: { fontSize: 13, textAlign: 'center' },

  tabs: { flexDirection: 'row', gap: 4, marginBottom: 16, backgroundColor: 'transparent' },
  tab: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },

  achievement: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  achievementIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  achievementBody: { flex: 1, minWidth: 0 },
  achievementTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  achievementTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  achievementDesc: { fontSize: 12, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  achievementProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  achievementProgressLabel: { fontSize: 11 },
  earnedAt: { fontSize: 11, marginTop: 6 },

  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  listTitle: { fontSize: 14, fontWeight: '600' },
  listMeta: { fontSize: 11, marginTop: 2 },
  rank: { width: 22, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
