import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** The brand mark + notification bell shown at the top of every tab, matching
 *  the web app's `TopBar` (components/shell/AppShell.tsx). */
export function AppHeader() {
  const colors = Colors[useColorScheme()];
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

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
    const interval = setInterval(load, 45_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.background, borderColor: colors.border, paddingTop: insets.top + 8 },
      ]}
    >
      <View style={styles.brand}>
        <View style={[styles.badge, { backgroundColor: colors.tint }]}>
          <Text style={[styles.badgeText, { color: colors.onBrand }]}>S</Text>
        </View>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Safar</Text>
          <Text style={[styles.tagline, { color: colors.muted }]}>PLAN · TRACK · EARN</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          style={styles.bellButton}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          {unread > 0 ? (
            <View style={[styles.dot, { backgroundColor: colors.danger, borderColor: colors.background }]}>
              <Text style={styles.dotText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>

        {user ? (
          <Pressable onPress={() => router.push('/(tabs)/profile')} accessibilityLabel="Profile">
            <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
              <Text style={styles.avatarEmoji}>{user.avatar_emoji}</Text>
            </View>
          </Pressable>
        ) : null}
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
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 16, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  tagline: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bellButton: { padding: 4 },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  dotText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 17 },
});
