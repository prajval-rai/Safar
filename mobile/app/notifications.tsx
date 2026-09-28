import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { Notification, NotificationKind, NotificationPage, TripInvite } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type IconName = keyof typeof Ionicons.glyphMap;

const KIND_ICONS: Record<NotificationKind, IconName> = {
  trip_member_added: 'map-outline',
  trip_invite: 'mail-outline',
  trip_joined: 'person-add-outline',
  trip_left: 'person-remove-outline',
  trip_started: 'play-circle-outline',
  trip_reminder: 'alarm-outline',
  activity_reminder: 'time-outline',
  trip_cancelled: 'close-circle-outline',
  trip_completed: 'trophy-outline',
  chat_message: 'chatbubble-outline',
  settle_paid: 'cash-outline',
  settle_confirmed: 'checkmark-done-outline',
  xp_released: 'lock-open-outline',
  track_used: 'git-branch-outline',
  track_published: 'radio-outline',
  new_follower: 'person-add-outline',
  achievement_unlocked: 'trophy-outline',
  reward_claimed: 'gift-outline',
  reward_update: 'gift-outline',
};

/** Where tapping a notification should go — trip and track detail screens
 *  both exist now, so this actually navigates rather than only marking read. */
function notificationHref(note: Notification): string | null {
  // An invitee isn't on the trip yet; invites are answered at the top of this screen.
  if (note.kind === 'trip_invite') return null;
  if (note.trip_id) return `/trips/${note.trip_id}`;
  if (note.track_id) return `/tracks/${note.track_id}`;
  if (note.kind === 'new_follower' && note.actor) return `/u/${note.actor.username}`;
  if (note.kind === 'reward_update') return '/(tabs)/rewards';
  return null;
}

export default function NotificationsScreen() {
  const colors = Colors[useColorScheme()];
  const { data, loading, refreshing, error, refresh, set } = useFetch<NotificationPage>('/api/notifications/');
  const invites = useFetch<TripInvite[]>('/api/invites/');
  const [answering, setAnswering] = useState<number | null>(null);

  async function answer(invite: TripInvite, decision: 'accept' | 'decline') {
    setAnswering(invite.id);
    try {
      await api(`/api/invites/${invite.id}/${decision}/`, { method: 'POST' });
      invites.set((invites.data ?? []).filter((i) => i.id !== invite.id));
      if (decision === 'accept') router.push(`/trips/${invite.trip.id}` as never);
    } catch (err) {
      Alert.alert("Couldn't answer that invite", err instanceof Error ? err.message : 'Try again.');
      invites.refresh();
    } finally {
      setAnswering(null);
    }
  }

  function markRead(note: Notification) {
    if (note.read || !data) return;
    set({
      ...data,
      results: data.results.map((n) => (n.id === note.id ? { ...n, read: true } : n)),
      unread_count: Math.max(0, data.unread_count - 1),
    });
    api(`/api/notifications/${note.id}/read/`, { method: 'POST' }).catch(() => {});
  }

  function markAllRead() {
    if (!data || data.unread_count === 0) return;
    set({ ...data, results: data.results.map((n) => ({ ...n, read: true })), unread_count: 0 });
    api('/api/notifications/read-all/', { method: 'POST' }).catch(() => {});
  }

  function openNotification(note: Notification) {
    markRead(note);
    const href = notificationHref(note);
    if (href) router.push(href as never);
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            refresh();
            invites.refresh();
          }}
          tintColor={colors.tint}
        />
      }
    >
      {invites.data && invites.data.length ? (
        <View style={styles.invites}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>TRIP INVITES</Text>
          {invites.data.map((invite) => (
            <View key={invite.id} style={[styles.invite, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.title, { color: colors.text }]}>{invite.trip.title}</Text>
              <Text style={[styles.desc, { color: colors.muted }]}>
                📍 {invite.trip.destination} · {invite.trip.start_date} → {invite.trip.end_date} ·{' '}
                {invite.trip.duration_days} days
              </Text>
              <Text style={[styles.desc, { color: colors.muted }]}>
                {invite.invited_by.name} invited you · {invite.trip.member_count} going · {invite.trip.stop_count} stops
              </Text>
              {invite.trip.no_xp ? (
                <Text style={[styles.desc, { color: colors.muted }]}>🏠 Close to home — this trip earns no XP.</Text>
              ) : null}
              <View style={styles.inviteActions}>
                <Pressable
                  disabled={answering !== null}
                  onPress={() => answer(invite, 'decline')}
                  style={[styles.inviteButton, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Decline</Text>
                </Pressable>
                <Pressable
                  disabled={answering !== null}
                  onPress={() => answer(invite, 'accept')}
                  style={[styles.inviteButton, { backgroundColor: colors.tint, borderColor: colors.tint }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {answering === invite.id ? 'Joining…' : 'Accept'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {data && data.unread_count > 0 ? (
        <Pressable onPress={markAllRead} style={styles.markAll}>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>Mark all as read</Text>
        </Pressable>
      ) : null}

      {!data || data.results.length === 0 ? (
        <EmptyState message="You're all caught up. Invites and trip updates will show up here." />
      ) : (
        data.results.map((note) => (
          <Pressable
            key={note.id}
            onPress={() => openNotification(note)}
            style={[
              styles.row,
              { borderColor: colors.border, backgroundColor: note.read ? colors.background : colors.brandSoft },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.raised }]}>
              <Ionicons name={KIND_ICONS[note.kind]} size={17} color={colors.tint} />
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: colors.text }]}>{note.title}</Text>
                {!note.read ? <View style={[styles.dot, { backgroundColor: colors.tint }]} /> : null}
              </View>
              {note.body ? <Text style={[styles.desc, { color: colors.muted }]}>{note.body}</Text> : null}
              <Text style={[styles.time, { color: colors.muted }]}>{relativeTime(note.created_at)}</Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 32, flexGrow: 1 },
  markAll: { alignSelf: 'flex-end', padding: 8, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 12, marginBottom: 4 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  desc: { fontSize: 13, marginTop: 2 },
  time: { fontSize: 11, marginTop: 4 },
  invites: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6, marginLeft: 4 },
  invite: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, gap: 2 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  inviteButton: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
});
