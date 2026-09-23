import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ErrorState, Loading } from '@/components/ScreenState';
import { TripCover } from '@/components/TripCover';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError, api } from '@/lib/api';
import { CATEGORY_ICONS, clockTime, rupees, todayISO, TRIP_TYPE_LABELS } from '@/lib/format';
import type { TrackDetail, TrackStop, Trip } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function TrackDetailScreen() {
  const colors = Colors[useColorScheme()];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: track, loading, error, refresh, set } = useFetch<TrackDetail>(id ? `/api/explore/tracks/${id}/` : null);
  const [useOpen, setUseOpen] = useState(false);
  const [openDay, setOpenDay] = useState<number | null>(1);

  if (loading && !track) return <Loading />;
  if (error && !track) return <ErrorState message={error} onRetry={refresh} />;
  if (!track) return null;

  async function toggleSave() {
    if (!track) return;
    try {
      const result = await api<{ saved: boolean }>(`/api/explore/tracks/${track.id}/save/`, { method: 'POST' });
      set({ ...track, saved: result.saved });
    } catch {
      // A failed save toggle isn't worth interrupting the page for.
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }}>
      <Link href="/(tabs)/explore" style={styles.back}>
        <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 13 }}>← Explore</Text>
      </Link>

      <TripCover cover={track.cover_key} radius={0} style={styles.cover}>
        <View style={styles.coverOverlay}>
          <Text style={styles.coverTitle}>{track.title}</Text>
          <Text style={styles.coverSubtitle}>
            📍 {track.destination}
            {track.region ? `, ${track.region}` : ''}
          </Text>
        </View>
      </TripCover>

      <View style={styles.body}>
        <View style={styles.chips}>
          <Chip label={`${track.days} ${track.days === 1 ? 'day' : 'days'}`} tone="brand" colors={colors} />
          <Chip label={`${track.stop_count} stops`} colors={colors} />
          <Chip label={TRIP_TYPE_LABELS[track.trip_type] ?? track.trip_type} colors={colors} />
          <Chip label={track.difficulty} colors={colors} />
          {track.estimated_cost ? <Chip label={`${rupees(track.estimated_cost)} each`} colors={colors} /> : null}
          {track.best_season ? <Chip label={`Best: ${track.best_season}`} tone="accent" colors={colors} /> : null}
        </View>

        {track.summary ? <Text style={{ color: colors.text, fontSize: 15, marginBottom: 14 }}>{track.summary}</Text> : null}

        <Pressable
          onPress={() => router.push(`/u/${track.author.username}`)}
          style={[styles.authorRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ fontSize: 18 }}>{track.author.avatar_emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{track.author.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Level {track.author.level} · {track.likes_count} likes
            </Text>
          </View>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>View profile</Text>
        </Pressable>

        <View style={styles.actionRow}>
          <Pressable onPress={() => setUseOpen(true)} style={[styles.actionButton, { backgroundColor: colors.tint }]}>
            <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 14 }}>➕ Use this track</Text>
          </Pressable>
          <Pressable
            onPress={toggleSave}
            style={[styles.actionButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              {track.saved ? '🔖 Saved' : '📑 Save for later'}
            </Text>
          </Pressable>
        </View>

        {track.route.length ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.cardLabel}>The route</Text>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 4 }}>{track.route.join(' → ')}</Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Day by day</Text>
        {track.track_days.map((day) => {
          const open = openDay === day.index;
          return (
            <View key={day.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable onPress={() => setOpenDay(open ? null : day.index)} style={styles.dayHeader}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                  Day {day.index} <Text style={{ color: colors.muted, fontWeight: '500', fontSize: 13 }}>
                    {day.stops.length} {day.stops.length === 1 ? 'stop' : 'stops'}
                  </Text>
                </Text>
                <Text style={{ color: colors.muted }}>{open ? '▲' : '▼'}</Text>
              </Pressable>
              {open ? (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {day.stops.map((stop) => (
                    <StopRow key={stop.id} stop={stop} colors={colors} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <UseTrackModal visible={useOpen} onClose={() => setUseOpen(false)} trackId={track.id} defaultTitle={track.title} />
    </ScrollView>
  );
}

function StopRow({ stop, colors }: { stop: TrackStop; colors: (typeof Colors)['light'] }) {
  const meta = [stop.place_name, clockTime(stop.start_time), stop.cost ? rupees(stop.cost) : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.stopRow}>
      <Text style={{ fontSize: 16 }}>{CATEGORY_ICONS[stop.category] ?? '📍'}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{stop.title}</Text>
        {meta ? <Text style={{ color: colors.muted, fontSize: 11 }}>{meta}</Text> : null}
      </View>
      <View style={[styles.xpChip, { backgroundColor: colors.brandSoft }]}>
        <Text style={{ color: colors.tint, fontSize: 11, fontWeight: '700' }}>+{stop.xp_value}</Text>
      </View>
    </View>
  );
}

function Chip({ label, tone, colors }: { label: string; tone?: 'brand' | 'accent'; colors: (typeof Colors)['light'] }) {
  const bg = tone === 'brand' ? colors.brandSoft : tone === 'accent' ? colors.accentSoft : colors.raised;
  const fg = tone === 'brand' ? colors.tint : tone === 'accent' ? colors.accent : colors.muted;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function UseTrackModal({
  visible,
  onClose,
  trackId,
  defaultTitle,
}: {
  visible: boolean;
  onClose: () => void;
  trackId: string;
  defaultTitle: string;
}) {
  const colors = Colors[useColorScheme()];
  const [title, setTitle] = useState(defaultTitle);
  const [startDate, setStartDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const trip = await api<Trip>(`/api/explore/tracks/${trackId}/use/`, {
        method: 'POST',
        body: { start_date: startDate, title: title.trim() },
      });
      onClose();
      router.push(`/trips/${trip.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't copy that track.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Make this your trip</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 14 }}>
            We&apos;ll copy every day and stop into a new trip you can edit.
          </Text>

          <Text style={styles.label}>Call it</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            value={title}
            onChangeText={setTitle}
          />
          <Text style={styles.label}>Starting on (YYYY-MM-DD)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            value={startDate}
            onChangeText={setStartDate}
            keyboardType="numbers-and-punctuation"
          />

          {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 8 }}>{error}</Text> : null}

          <Pressable
            onPress={go}
            disabled={busy || !startDate || !title.trim()}
            style={[styles.submit, { backgroundColor: colors.tint, opacity: busy ? 0.6 : 1 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={{ color: colors.onBrand, fontWeight: '700' }}>Create my trip</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  cover: { height: 190, justifyContent: 'flex-end' },
  coverOverlay: { padding: 16, backgroundColor: 'rgba(0,0,0,0.15)' },
  coverTitle: { color: '#fff', fontSize: 21, fontWeight: '800' },
  coverSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
  body: { padding: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionRow: { gap: 10, marginBottom: 16 },
  actionButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: '#8a8a8a' },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10, marginTop: 6 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  xpChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10, color: '#8a8a8a' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  submit: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
});
