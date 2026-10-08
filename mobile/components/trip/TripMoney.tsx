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

import { Avatar, usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CATEGORY_ICONS, rupees, shortDate } from '@/lib/format';
import type { ActivityCategory, ExpenseSummary } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const CATEGORIES: ActivityCategory[] = ['food', 'travel', 'stay', 'sightseeing', 'shopping', 'adventure', 'event'];

/** What the group has spent, split equally: the total, each person's
 *  balance (who gets money back, who owes), and every expense. */
export function TripMoney({ tripId }: { tripId: string }) {
  const colors = usePalette();
  const { user } = useAuth();
  const { data, loading, error, refresh } = useFetch<ExpenseSummary>(`/api/trips/${tripId}/expenses/`);
  const [adding, setAdding] = useState(false);

  if (loading && !data) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (error && !data) {
    return (
      <Pressable onPress={refresh}>
        <Text style={[styles.note, { color: colors.danger }]}>{error} Tap to retry.</Text>
      </Pressable>
    );
  }
  if (!data) return null;

  const mine = data.balances.find((b) => b.user.id === user?.id);

  return (
    <View>
      <View style={[styles.summary, { backgroundColor: colors.nav }]}>
        <Text style={{ color: '#b8bdc4', fontSize: 13 }}>Spent together</Text>
        <Text style={{ color: colors.onNav, fontSize: 30, fontWeight: '800' }}>{rupees(data.total)}</Text>
        <Text style={{ color: '#b8bdc4', fontSize: 13 }}>{rupees(data.per_person_share)} each</Text>
        {mine ? (
          <View style={[styles.mine, { backgroundColor: colors.highlight }]}>
            <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 14 }}>
              {mine.balance > 0
                ? `You get back ${rupees(mine.balance)}`
                : mine.balance < 0
                  ? `You owe ${rupees(-mine.balance)}`
                  : "You're all square"}
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable onPress={() => setAdding(true)} style={[styles.add, { backgroundColor: colors.highlight }]}>
        <Ionicons name="add" size={20} color={colors.onHighlight} />
        <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 15 }}>Add expense</Text>
      </Pressable>

      {data.balances.length > 1 ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Who&apos;s even</Text>
          {data.balances.map((b) => (
            <View key={b.user.id} style={styles.row}>
              <Avatar emoji={b.user.avatar_emoji} size={34} />
              <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {b.user.name}
              </Text>
              <Text
                style={{
                  fontWeight: '800',
                  color: b.balance > 0 ? colors.success : b.balance < 0 ? colors.danger : colors.muted,
                }}
              >
                {b.balance > 0 ? `+${rupees(b.balance)}` : b.balance < 0 ? `−${rupees(-b.balance)}` : 'even'}
              </Text>
            </View>
          ))}
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
            Settle up with UPI links from the trip on the website.
          </Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Expenses</Text>
        {data.results.length ? (
          data.results.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: colors.raised }]}>
                <Text style={{ fontSize: 17 }}>{CATEGORY_ICONS[e.category as ActivityCategory] ?? '💸'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                  {e.paid_by.name} paid · {shortDate(e.spent_on)}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{rupees(e.amount)}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.muted, fontSize: 14, marginTop: 6 }}>Nothing logged yet.</Text>
        )}
      </View>

      <AddExpense tripId={tripId} visible={adding} onClose={() => setAdding(false)} onSaved={refresh} />
    </View>
  );
}

function AddExpense({
  tripId,
  visible,
  onClose,
  onSaved,
}: {
  tripId: string;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = usePalette();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('food');
  const [busy, setBusy] = useState(false);
  const ready = title.trim() && Number(amount) > 0;

  async function save() {
    setBusy(true);
    try {
      await api(`/api/trips/${tripId}/expenses/`, {
        method: 'POST',
        body: { title: title.trim(), amount: Math.round(Number(amount)), category, split_type: 'equal' },
      });
      setTitle('');
      setAmount('');
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't add that", e instanceof ApiError ? e.message : 'Try again.');
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
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Add expense</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>You paid — split equally with everyone.</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
              placeholder="What for? (e.g. Dinner at Baga)"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, fontSize: 22, fontWeight: '800' }]}
              placeholder="₹ Amount"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
            />
            <View style={styles.cats}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.cat, { backgroundColor: category === c ? colors.highlight : colors.raised }]}
                >
                  <Text style={{ fontSize: 18 }}>{CATEGORY_ICONS[c]}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={save}
              disabled={!ready || busy}
              style={[styles.save, { backgroundColor: colors.highlight, opacity: !ready || busy ? 0.55 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onHighlight} />
              ) : (
                <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 15 }}>Save</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 26, padding: 20, alignItems: 'center', gap: 2 },
  mine: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginTop: 12 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 14,
    marginVertical: 14,
  },
  card: { borderRadius: 24, padding: 16, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 14, textAlign: 'center', marginTop: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, gap: 10 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 6 },
  input: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  save: { borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
});
