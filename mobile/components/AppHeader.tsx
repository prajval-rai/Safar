import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, CircleButton, usePalette } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** "Hey, Name 👋" with your city, and round search + notification buttons —
 *  shown at the top of every tab. Tapping your avatar opens your profile. */
export function AppHeader() {
  const colors = usePalette();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () => {
      api<{ unread_count: number }>('/api/notifications/unread-count/')
        .then((data) => {
          if (active) setUnread(data.unread_count);
        })
        .catch(() => {
          // A missed poll isn't worth surfacing — the next one will catch up.
        });
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  const firstName = (user?.display_name || user?.username || 'there').split(' ')[0];

  return (
    <View style={[styles.row, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
      <Pressable
        onPress={() => router.push('/(tabs)/profile')}
        accessibilityLabel="Your profile"
        style={styles.who}
      >
        <Avatar emoji={user?.avatar_emoji ?? '🧳'} size={48} />
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.hey, { color: colors.muted }]} numberOfLines={1}>
            Hey, <Text style={{ color: colors.text, fontWeight: '800' }}>{firstName}</Text> 👋
          </Text>
          <View style={styles.place}>
            <Ionicons name="location" size={12} color={colors.text} />
            <Text style={[styles.placeText, { color: colors.text }]} numberOfLines={1}>
              {user?.home_city || `Level ${user?.level ?? 1} · ${user?.level_name ?? 'Traveller'}`}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <CircleButton
          icon="notifications-outline"
          label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          badge={unread}
          onPress={() => router.push('/notifications')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  hey: { fontSize: 18 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  placeText: { fontSize: 12, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 10 },
});
