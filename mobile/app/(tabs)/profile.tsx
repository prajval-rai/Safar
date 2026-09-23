import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { IndiaAchievementMap } from '@/components/IndiaAchievementMap';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import type { TravelMapData, User } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const AVATARS = ['🧳', '🏍️', '📸', '⛰️', '🌴', '🍛', '🚂', '🪂', '🧭', '🎒', '🛺', '🏕️'];

export default function ProfileScreen() {
  const colors = Colors[useColorScheme()];
  const { user, logout, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);

  useFocusEffect(useCallback(() => { refreshUser(); }, [refreshUser]));

  const { data: travelMap } = useFetch<TravelMapData>(user ? `/api/users/${user.username}/travel-map/` : null);

  function confirmLogout() {
    Alert.alert('Log out?', 'You can log back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }

  if (!user) return null;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Text style={styles.avatarEmoji}>{user.avatar_emoji}</Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{user.display_name || user.username}</Text>
        <Text style={[styles.username, { color: colors.muted }]}>@{user.username}</Text>
        {user.home_city ? <Text style={[styles.city, { color: colors.muted }]}>📍 {user.home_city}</Text> : null}
        {user.bio ? <Text style={[styles.bio, { color: colors.text }]}>{user.bio}</Text> : null}

        <View style={[styles.levelChip, { backgroundColor: colors.brandSoft }]}>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>
            Level {user.level} · {user.level_name}
          </Text>
        </View>

        <View style={styles.progressWrap}>
          <Text style={[styles.progressLabel, { color: colors.muted }]}>
            {user.xp_into_level.toLocaleString('en-IN')} / {user.xp_for_next_level.toLocaleString('en-IN')} XP to level{' '}
            {user.level + 1}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${Math.max(4, user.level_progress)}%` }]} />
          </View>
        </View>

        <Pressable onPress={() => setEditing(true)} style={[styles.editButton, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Edit profile</Text>
        </Pressable>
      </View>

      {travelMap ? <IndiaAchievementMap data={travelMap} /> : null}

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
        <Row label="Username" value={`@${user.username}`} colors={colors} />
        {user.email ? <Row label="Email" value={user.email} colors={colors} /> : null}
        <Row label="Travelling since" value={shortDate(user.date_joined.slice(0, 10))} colors={colors} last />
        <Pressable onPress={confirmLogout} style={[styles.logout, { borderColor: colors.danger }]}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>Log out</Text>
        </Pressable>
      </View>

      <EditProfileModal visible={editing} user={user} onClose={() => setEditing(false)} />
    </ScrollView>
  );
}

function Row({ label, value, colors, last }: { label: string; value: string; colors: (typeof Colors)['light']; last?: boolean }) {
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

function EditProfileModal({ visible, user, onClose }: { visible: boolean; user: User; onClose: () => void }) {
  const colors = Colors[useColorScheme()];
  const { refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user.display_name || user.name);
  const [homeCity, setHomeCity] = useState(user.home_city);
  const [bio, setBio] = useState(user.bio);
  const [avatar, setAvatar] = useState(user.avatar_emoji);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api<User>('/api/auth/me/', {
        method: 'PATCH',
        body: { display_name: displayName, home_city: homeCity, bio, avatar_emoji: avatar },
      });
      await refreshUser();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.card }} contentContainerStyle={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Edit profile</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: colors.muted, fontSize: 20 }}>✕</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Your name</Text>
        <TextInput style={inputStyle} value={displayName} onChangeText={setDisplayName} />

        <Text style={[styles.label, { color: colors.text }]}>Home city</Text>
        <TextInput style={inputStyle} value={homeCity} onChangeText={setHomeCity} placeholder="Pune" placeholderTextColor={colors.muted} />

        <Text style={[styles.label, { color: colors.text }]}>One line about you</Text>
        <TextInput
          style={[inputStyle, { minHeight: 70, textAlignVertical: 'top' }]}
          value={bio}
          onChangeText={setBio}
          placeholder="Weekend trips and long drives."
          placeholderTextColor={colors.muted}
          multiline
        />

        <Text style={[styles.label, { color: colors.text }]}>Avatar</Text>
        <View style={styles.avatarRow}>
          {AVATARS.map((emoji) => {
            const selected = avatar === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => setAvatar(emoji)}
                style={[styles.avatarOption, { borderColor: selected ? colors.tint : colors.border, backgroundColor: selected ? colors.brandSoft : colors.background }]}
              >
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{error}</Text> : null}

        <Pressable onPress={save} disabled={busy} style={[styles.saveButton, { backgroundColor: colors.tint, opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 16 }}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </Modal>
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
  progressWrap: { width: '100%', maxWidth: 280, marginTop: 10 },
  progressLabel: { fontSize: 11, textAlign: 'center', marginBottom: 6 },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  editButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, marginTop: 12 },

  section: { borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  logout: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 16 },

  modalContainer: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  avatarOption: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
});
