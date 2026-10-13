import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { TripDetail } from '@/lib/types';

/** No signal at the stops, so nothing could be marked done? The organiser
 *  sends the trip to an admin instead, with photos as the proof; the admin
 *  confirms it and the trip is completed. Everyone sees where it stands. */
export function CompletionRequestCard({
  trip,
  canEdit,
  onAddPhotos,
  onChanged,
}: {
  trip: TripDetail;
  canEdit: boolean;
  onAddPhotos: () => void;
  onChanged: () => void;
}) {
  const colors = usePalette();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const review = trip.completion_review;
  if (!review) return null;
  if (trip.status === 'completed' && review.status !== 'approved') return null;

  async function send() {
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/request-completion/`, { method: 'POST', body: { note: note.trim() } });
      Alert.alert('Sent to an admin', "You'll get a notification when they've looked at it.");
      onChanged();
    } catch (e) {
      Alert.alert("Couldn't send it", e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (review.status === 'approved') {
    return (
      <View style={[styles.card, { backgroundColor: colors.successSoft }]}>
        <Text style={{ color: colors.success, fontWeight: '800', fontSize: 15 }}>✅ Confirmed by an admin from its photos</Text>
        {review.note ? <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{review.note}</Text> : null}
      </View>
    );
  }

  if (review.status === 'pending') {
    return (
      <View style={[styles.card, { backgroundColor: colors.warnSoft }]}>
        <View style={styles.row}>
          <Ionicons name="hourglass-outline" size={20} color={colors.warn} />
          <Text style={{ color: colors.warn, fontWeight: '800', fontSize: 15, flex: 1 }}>Waiting for an admin</Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>
          The trip was sent for confirmation with {review.photos} photos. Everyone will hear when it&apos;s done.
        </Text>
      </View>
    );
  }

  // Not asked yet, or turned down: only organisers can (re)send it.
  if (!canEdit) return null;
  const enough = review.photos >= review.photos_needed;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
            {review.status === 'rejected' ? 'Send it again' : "Couldn't mark it done in the app?"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
            No signal at the stops? Send the trip to an admin with photos from it — once they confirm, it&apos;s completed
            for everyone.
          </Text>
        </View>
      </View>

      {review.status === 'rejected' && review.note ? (
        <View style={[styles.rejected, { backgroundColor: colors.dangerSoft }]}>
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Admin: {review.note}</Text>
        </View>
      ) : null}

      <View style={styles.photosRow}>
        <Ionicons name={enough ? 'checkmark-circle' : 'images-outline'} size={18} color={enough ? colors.success : colors.muted} />
        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
          {review.photos} of {review.photos_needed} photos needed
        </Text>
        {!enough ? (
          <Pressable onPress={onAddPhotos} style={[styles.small, { backgroundColor: colors.raised }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Add photos</Text>
          </Pressable>
        ) : null}
      </View>

      <TextInput
        style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
        placeholder="Anything the admin should know? (optional)"
        placeholderTextColor={colors.muted}
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 300))}
        multiline
      />

      <Pressable
        onPress={send}
        disabled={busy || !enough}
        style={[styles.send, { backgroundColor: colors.highlight, opacity: busy || !enough ? 0.55 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onHighlight} />
        ) : (
          <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 15 }}>Send to admin for review</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 18, marginBottom: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rejected: { borderRadius: 14, padding: 10 },
  photosRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  input: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, minHeight: 56, textAlignVertical: 'top' },
  send: { borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
});
