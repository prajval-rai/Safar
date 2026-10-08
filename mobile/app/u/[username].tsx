import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { ProfileView } from '@/components/ProfileView';
import { usePalette } from '@/components/ui';
import { api } from '@/lib/api';
import type { PublicProfile } from '@/lib/types';

/** Someone else's profile — the shared layout with Follow. */
export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  if (!username) return null;
  return <ProfileView username={username} actions={(profile, set) => <FollowButton profile={profile} set={set} />} />;
}

function FollowButton({ profile, set }: { profile: PublicProfile; set: (p: PublicProfile) => void }) {
  const colors = usePalette();
  const [busy, setBusy] = useState(false);

  if (profile.is_me) {
    return (
      <Pressable onPress={() => router.push('/(tabs)/profile')} style={[styles.button, { backgroundColor: colors.card }]}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>This is you</Text>
      </Pressable>
    );
  }

  async function toggle() {
    setBusy(true);
    try {
      const result = await api<{ is_following: boolean; followers_count: number }>(
        `/api/users/${encodeURIComponent(profile.user.username)}/follow/`,
        { method: profile.is_following ? 'DELETE' : 'POST' },
      );
      set({ ...profile, is_following: result.is_following, followers_count: result.followers_count });
    } catch {
      // Leave it as it was — tapping again retries.
    } finally {
      setBusy(false);
    }
  }

  const following = profile.is_following;
  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      style={[styles.button, { backgroundColor: following ? colors.card : colors.nav, minWidth: 160 }]}
    >
      {busy ? (
        <ActivityIndicator color={following ? colors.text : colors.onNav} />
      ) : (
        <Text style={{ color: following ? colors.text : colors.onNav, fontWeight: '800', fontSize: 15 }}>
          {following ? 'Following' : 'Follow'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 999, paddingHorizontal: 28, paddingVertical: 13, alignItems: 'center' },
});
