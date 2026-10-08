import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ChecklistItem } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/** What to pack and do before the trip: the group's shared items and your
 *  own. Tap to tick; add one at the top (it goes on your own list, or the
 *  group's if you choose "For everyone"). */
export function TripChecklist({ tripId }: { tripId: string }) {
  const colors = usePalette();
  const { user } = useAuth();
  const { data, loading, error, refresh, set } = useFetch<ChecklistItem[]>(`/api/trips/${tripId}/checklist/`);
  const [title, setTitle] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api(`/api/trips/${tripId}/checklist/`, {
        method: 'POST',
        body: { title: title.trim(), ...(shared ? { assigned_to_id: null } : {}) },
      });
      setTitle('');
      refresh();
    } catch (e) {
      Alert.alert("Couldn't add that", e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: ChecklistItem) {
    const items = data ?? [];
    set(items.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i)));
    try {
      await api(`/api/checklist/${item.id}/`, { method: 'PATCH', body: { is_done: !item.is_done } });
    } catch (e) {
      set(items);
      Alert.alert("Couldn't update that", e instanceof ApiError ? e.message : 'Try again.');
    }
  }

  const items = data ?? [];
  const groups: { title: string; items: ChecklistItem[] }[] = [
    { title: 'For everyone', items: items.filter((i) => !i.assigned_to) },
    { title: 'Mine', items: items.filter((i) => i.assigned_to?.id === user?.id) },
    { title: 'Others', items: items.filter((i) => i.assigned_to && i.assigned_to.id !== user?.id) },
  ].filter((g) => g.items.length);

  return (
    <View>
      <View style={[styles.addCard, { backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
          placeholder="Add an item — sunscreen, ID, power bank…"
          placeholderTextColor={colors.muted}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <View style={styles.addRow}>
          <Pressable onPress={() => setShared((v) => !v)} style={styles.sharedToggle} hitSlop={6}>
            <Ionicons name={shared ? 'checkbox' : 'square-outline'} size={20} color={shared ? colors.tint : colors.muted} />
            <Text style={{ color: colors.text, fontSize: 13 }}>For everyone</Text>
          </Pressable>
          <Pressable
            onPress={add}
            disabled={busy || !title.trim()}
            style={[styles.addButton, { backgroundColor: colors.highlight, opacity: busy || !title.trim() ? 0.55 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onHighlight} size="small" />
            ) : (
              <Text style={{ color: colors.onHighlight, fontWeight: '800' }}>Add</Text>
            )}
          </Pressable>
        </View>
      </View>

      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error && !data ? (
        <Pressable onPress={refresh}>
          <Text style={[styles.note, { color: colors.danger }]}>{error} Tap to retry.</Text>
        </Pressable>
      ) : groups.length ? (
        groups.map((group) => (
          <View key={group.title} style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.label, { color: colors.muted }]}>
              {group.title} · {group.items.filter((i) => i.is_done).length}/{group.items.length}
            </Text>
            {group.items.map((item) => (
              <Pressable key={item.id} onPress={() => toggle(item)} style={styles.row}>
                <Ionicons
                  name={item.is_done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={item.is_done ? colors.success : colors.muted}
                />
                <Text
                  style={{
                    flex: 1,
                    color: item.is_done ? colors.muted : colors.text,
                    fontSize: 15,
                    textDecorationLine: item.is_done ? 'line-through' : 'none',
                  }}
                >
                  {item.title}
                </Text>
                {group.title === 'Others' && item.assigned_to ? (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{item.assigned_to.name.split(' ')[0]}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ))
      ) : (
        <Text style={[styles.note, { color: colors.muted }]}>Nothing on the checklist yet.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  addCard: { borderRadius: 24, padding: 14, gap: 10, marginBottom: 12 },
  input: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sharedToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addButton: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  card: { borderRadius: 24, padding: 16, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  note: { fontSize: 14, textAlign: 'center', marginTop: 20 },
});
