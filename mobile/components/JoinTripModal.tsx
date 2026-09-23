import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError, api } from '@/lib/api';
import type { Trip } from '@/lib/types';

export function JoinTripModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = Colors[useColorScheme()];
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setError(null);
    setBusy(true);
    try {
      await api<Trip>('/api/trips/join/', { method: 'POST', body: { code: code.trim() } });
      setCode('');
      onClose();
      // No trip detail screen yet (see README) — the joined trip shows up on
      // Home/My Trips, which refetch on focus.
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't join that trip.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>Join a trip</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Ask the organiser for the 6-character invite code.
          </Text>

          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="A1B2C3"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoFocus
            maxLength={12}
          />

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Pressable
            onPress={join}
            disabled={busy || code.trim().length < 4}
            style={[
              styles.submit,
              { backgroundColor: colors.tint, opacity: busy || code.trim().length < 4 ? 0.5 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 16 }}>Join trip</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 6,
  },
  error: { fontSize: 13, marginTop: 10, textAlign: 'center' },
  submit: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
});
