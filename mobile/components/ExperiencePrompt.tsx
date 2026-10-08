import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { TAB_BAR_SPACE } from '@/components/FloatingTabBar';
import type { Palette } from '@/constants/Colors';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateRange } from '@/lib/format';
import type { Trip, XPResult } from '@/lib/types';

/** Once a trip is over, a small pop-up floats in asking how it went. Tapping it
 *  opens a sheet to write about the trip — or skip, which means we never ask
 *  about that trip again. */
export function ExperiencePrompt({
  trip,
  xpEarned,
  colors,
  onDone,
}: {
  trip: Trip;
  xpEarned: number;
  colors: Palette;
  onDone: () => void;
}) {
  const { refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = text.trim().length >= 10;

  async function save() {
    setBusy(true);
    try {
      const result = await api<XPResult>(`/api/trips/${trip.id}/experience/`, {
        method: 'POST',
        body: { text: text.trim() },
      });
      await refreshUser();
      setOpen(false);
      Alert.alert('Thanks for sharing', result.xp_awarded ? `+${result.xp_awarded} XP` : 'Saved.');
      onDone();
    } catch (e) {
      Alert.alert("Couldn't save that", e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/experience/skip/`, { method: 'POST', body: {} });
      setOpen(false);
      onDone();
    } catch (e) {
      Alert.alert("Couldn't skip that", e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open ? (
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.promptPill, { backgroundColor: colors.card, borderColor: colors.highlight }]}
        >
          <View style={[styles.promptIcon, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ fontSize: 20 }}>📝</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
              How was {trip.title}?
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              You earned <Text style={{ color: colors.tint, fontWeight: '800' }}>+{xpEarned} XP</Text>. Tap to share.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.promptBackdrop} onPress={() => setOpen(false)}>
            <Pressable style={[styles.promptSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.experienceTitle, { color: colors.text }]}>How was {trip.title}?</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {trip.destination} · {dateRange(trip.start_date, trip.end_date)} · +{xpEarned} XP earned
              </Text>
              <TextInput
                style={[styles.experienceInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="The best moment, what you'd skip, tips for whoever goes next…"
                placeholderTextColor={colors.muted}
                multiline
                autoFocus
                maxLength={4000}
                value={text}
                onChangeText={setText}
              />
              <Text style={{ color: colors.muted, fontSize: 11 }}>Skip and we won&apos;t ask about this trip again.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={skip}
                  disabled={busy}
                  style={[styles.skipButton, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Skip</Text>
                </Pressable>
                <Pressable
                  onPress={save}
                  disabled={busy || !ready}
                  style={[styles.bannerButton, { backgroundColor: colors.highlight, opacity: busy || !ready ? 0.5 : 1 }]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.onHighlight} />
                  ) : (
                    <Text style={[styles.bannerButtonText, { color: colors.onHighlight }]}>Share my experience</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bannerButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, paddingVertical: 13 },
  bannerButtonText: { fontSize: 14, fontWeight: '800' },
  promptPill: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: TAB_BAR_SPACE - 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  promptIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  promptBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  promptSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 12 },
  skipButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  experienceTitle: { fontSize: 17, fontWeight: '800' },
  experienceInput: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 96, fontSize: 14, textAlignVertical: 'top' },
});
