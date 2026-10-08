import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import { ProfileView } from '@/components/ProfileView';
import { usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import type { User } from '@/lib/types';

const AVATARS = ['🧳', '🏍️', '📸', '⛰️', '🌴', '🍛', '🚂', '🪂', '🧭', '🎒', '🛺', '🏕️'];

/** Your own profile: the shared profile layout, with Edit and Invite in
 *  place of Follow, and your account settings at the bottom. */
export default function ProfileScreen() {
  const colors = usePalette();
  const { user, logout } = useAuth();
  const [editing, setEditing] = useState(false);

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

  async function invite() {
    try {
      const me = await api<User & { referral_code?: string }>('/api/auth/me/');
      const code = me.referral_code ? `

Use my code when you sign up: ${me.referral_code}` : '';
      await Share.share({
        message: `Plan trips with me on Safar — earn XP for every place you really go.${code}`,
      });
    } catch {
      // Share sheet dismissed or offline — nothing to do.
    }
  }

  if (!user) return null;

  return (
    <>
      <ProfileView
        username={user.username}
        bottomSpace={TAB_BAR_SPACE}
        actions={() => (
          <>
            <Pressable onPress={() => setEditing(true)} style={[styles.actionButton, { backgroundColor: colors.nav }]}>
              <Ionicons name="create-outline" size={17} color={colors.onNav} />
              <Text style={{ color: colors.onNav, fontWeight: '700', fontSize: 14 }}>Edit profile</Text>
            </Pressable>
            <Pressable onPress={invite} style={[styles.actionButton, { backgroundColor: colors.card }]}>
              <Ionicons name="gift-outline" size={17} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Invite friends</Text>
            </Pressable>
          </>
        )}
        footer={
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
            <Row label="Username" value={`@${user.username}`} />
            {user.email ? <Row label="Email" value={user.email} /> : null}
            <Row label="Travelling since" value={shortDate(user.date_joined.slice(0, 10))} last />
            <Pressable onPress={confirmLogout} style={[styles.logout, { borderColor: colors.danger }]}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Log out</Text>
            </Pressable>
          </View>
        }
      />
      <EditProfileModal visible={editing} user={user} onClose={() => setEditing(false)} />
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const colors = usePalette();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function EditProfileModal({ visible, user, onClose }: { visible: boolean; user: User; onClose: () => void }) {
  const colors = usePalette();
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
                style={[styles.avatarOption, { borderColor: selected ? colors.highlight : colors.border, backgroundColor: selected ? colors.brandSoft : colors.background }]}
              >
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{error}</Text> : null}

        <Pressable onPress={save} disabled={busy} style={[styles.saveButton, { backgroundColor: colors.highlight, opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color={colors.onHighlight} /> : <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 16 }}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  section: { borderRadius: 24, padding: 18, marginTop: 22, marginHorizontal: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11 },
  logout: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 16 },

  modalContainer: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  avatarOption: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  saveButton: { borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
});
