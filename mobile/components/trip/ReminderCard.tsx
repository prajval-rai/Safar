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

import { usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { TripDetail } from '@/lib/types';

const DAYS_BEFORE = [
  { value: 0, label: 'Same day' },
  { value: 1, label: '1 day before' },
  { value: 2, label: '2 days before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: 'A week before' },
];
const TIMES = [
  { value: 7, label: '7 AM' },
  { value: 9, label: '9 AM' },
  { value: 13, label: '1 PM' },
  { value: 18, label: '6 PM' },
  { value: 21, label: '9 PM' },
];

/** When the "trip's coming up" reminder reaches everyone (with a checklist
 *  nudge for anyone with items left). Organisers set it; everyone sees it. */
export function ReminderCard({
  trip,
  canEdit,
  onChanged,
}: {
  trip: TripDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const colors = usePalette();
  const [open, setOpen] = useState(false);
  const upcoming = trip.status === 'planning';
  if (!upcoming) return null;

  const at = trip.pre_start_reminder_at ? new Date(trip.pre_start_reminder_at) : null;
  const when = at
    ? at.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : 'The day before the trip (default)';

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="alarm-outline" size={20} color={colors.tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>Reminder before the trip</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{when}</Text>
          {trip.pre_start_reminder_note ? (
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
              “{trip.pre_start_reminder_note}”
            </Text>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
            Everyone gets it, plus a nudge about anything left on their checklist.
          </Text>
        </View>
      </View>
      {canEdit ? (
        <Pressable onPress={() => setOpen(true)} style={[styles.button, { backgroundColor: colors.raised }]}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{at ? 'Change reminder' : 'Set reminder time'}</Text>
        </Pressable>
      ) : null}
      {/* Mounted only while open, so it starts fresh (and with the current time) each time. */}
      {canEdit && open ? (
        <ReminderSheet trip={trip} visible onClose={() => setOpen(false)} onSaved={onChanged} />
      ) : null}
    </View>
  );
}

function ReminderSheet({
  trip,
  visible,
  onClose,
  onSaved,
}: {
  trip: TripDetail;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = usePalette();
  const [days, setDays] = useState(1);
  const [hour, setHour] = useState(18);
  const [note, setNote] = useState(trip.pre_start_reminder_note);
  const [busy, setBusy] = useState(false);
  // "Now", taken once when the sheet opens — good enough to stop a time in the past.
  const [now] = useState(() => Date.now());

  // The chosen day and hour, in the phone's local time.
  const [y, m, d] = trip.start_date.split('-').map(Number);
  const chosen = new Date(y, m - 1, d - days, hour, 0, 0);
  const inPast = chosen.getTime() <= now;

  async function save(clear = false) {
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/reminder/`, {
        method: 'POST',
        body: clear ? { at: null, note: '' } : { at: chosen.toISOString(), note: note.trim() },
      });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save the reminder", e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Remind everyone</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              When should the group hear that {trip.title} is coming up?
            </Text>

            <Text style={[styles.label, { color: colors.muted }]}>Day</Text>
            <View style={styles.chips}>
              {DAYS_BEFORE.map((o) => (
                <Chip key={o.value} label={o.label} selected={days === o.value} onPress={() => setDays(o.value)} />
              ))}
            </View>

            <Text style={[styles.label, { color: colors.muted }]}>Time</Text>
            <View style={styles.chips}>
              {TIMES.map((o) => (
                <Chip key={o.value} label={o.label} selected={hour === o.value} onPress={() => setHour(o.value)} />
              ))}
            </View>

            <Text style={[styles.label, { color: colors.muted }]}>Note for everyone (optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
              placeholder="Meet at Dadar station, 6 AM. Bring your ID."
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 200))}
              multiline
            />

            <Text style={{ color: inPast ? colors.danger : colors.muted, fontSize: 13 }}>
              {inPast
                ? 'That time has already passed — pick a later one.'
                : `Goes out ${chosen.toLocaleString([], { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.`}
            </Text>

            <Pressable
              onPress={() => save()}
              disabled={busy || inPast}
              style={[styles.save, { backgroundColor: colors.highlight, opacity: busy || inPast ? 0.55 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onHighlight} />
              ) : (
                <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 15 }}>Save reminder</Text>
              )}
            </Pressable>
            {trip.pre_start_reminder_at ? (
              <Pressable onPress={() => save(true)} disabled={busy} style={{ alignSelf: 'center', padding: 6 }}>
                <Text style={{ color: colors.muted, fontWeight: '600' }}>Use the default (day before) instead</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = usePalette();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: selected ? colors.highlight : colors.raised }]}>
      <Text style={{ color: selected ? colors.onHighlight : colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 18, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  button: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, gap: 8 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  input: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, minHeight: 60, textAlignVertical: 'top' },
  save: { borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
});
