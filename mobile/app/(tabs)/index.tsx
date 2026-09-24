import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { JoinTripModal } from '@/components/JoinTripModal';
import { ErrorState, Loading } from '@/components/ScreenState';
import { TripCard } from '@/components/TripCard';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COVER_EMOJI, dateRange } from '@/lib/format';
import type { HomeData, Trip, XPResult } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

export default function HomeScreen() {
  const colors = Colors[useColorScheme()];
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh } = useFetch<HomeData>('/api/home/');
  const [joinOpen, setJoinOpen] = useState(false);

  // Coming back from "Plan a trip" or "Join with a code" (both push a screen
  // on top and pop back here) should show the result without a manual pull.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const hasAnything = data.live_trip || data.upcoming.length > 0 || data.past.length > 0;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        // Leave room so the floating experience prompt never hides the last card.
        contentContainerStyle={[styles.container, data.experience_prompt && { paddingBottom: 110 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
      >
        <Text style={[styles.greetingLine, { color: colors.muted }]}>
          {greeting()}, <Text style={{ fontWeight: '700', color: colors.text }}>{firstName(user?.display_name || user?.username)}</Text>{' '}
          👋
        </Text>
        <Text style={[styles.headline, { color: colors.text }]}>
          {data.live_trip ? 'Your trip is on.' : 'Where to next?'}
        </Text>

        {data.live_trip ? <LiveTripBanner trip={data.live_trip} colors={colors} /> : null}

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => setJoinOpen(true)}
            style={[styles.actionButton, styles.actionPrimary, { backgroundColor: colors.tint }]}
          >
            <Ionicons name="ticket-outline" size={18} color={colors.onBrand} />
            <Text style={[styles.actionText, { color: colors.onBrand }]}>Join with a code</Text>
          </Pressable>
        </View>

        {hasAnything ? (
          <View style={styles.stats}>
            <StatTile icon="briefcase" tone="tint" value={data.counts.trips} label="Trips" colors={colors} />
            <StatTile icon="checkmark-circle" tone="success" value={data.counts.completed} label="Completed" colors={colors} />
            <StatTile icon="location" tone="accent" value={data.counts.places} label="Places visited" colors={colors} />
          </View>
        ) : null}

        {data.upcoming.length > 0 ? (
          <Section title="Coming up" colors={colors}>
            {data.upcoming.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </Section>
        ) : null}

        {data.past.length > 0 ? (
          <Section title="Journeys you've finished" colors={colors}>
            {data.past.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </Section>
        ) : null}

        {!hasAnything ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Your journey starts here.</Text>
            <Text style={[styles.emptyLine, { color: colors.muted }]}>
              Plan a trip on safar.app from a computer or browser, then come back here to live it —
              or get an invite code from a friend and join theirs.
            </Text>
            <Pressable onPress={() => setJoinOpen(true)} style={[styles.emptyButton, { backgroundColor: colors.tint }]}>
              <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 15 }}>Join with a code</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {data.experience_prompt ? (
        <ExperiencePrompt
          key={data.experience_prompt.trip.id}
          trip={data.experience_prompt.trip}
          xpEarned={data.experience_prompt.xp_earned}
          colors={colors}
          onDone={refresh}
        />
      ) : null}

      <JoinTripModal visible={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name?: string): string {
  return (name ?? '').split(' ')[0] || 'there';
}

function LiveTripBanner({ trip, colors }: { trip: Trip; colors: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.banner, { borderColor: colors.border }]}>
      <LinearGradient
        colors={[colors.brandStrong, colors.tint]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bannerCover}
      >
        <Text style={styles.bannerEmoji}>{COVER_EMOJI[trip.cover_key] ?? '🧭'}</Text>
        <View style={[styles.liveChip, { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.tint }]} />
          <Text style={[styles.liveChipText, { color: colors.tint }]}>Happening now</Text>
        </View>
        <Text style={styles.bannerTitle}>{trip.title}</Text>
        <Text style={styles.bannerSubtitle}>
          {trip.destination} · {dateRange(trip.start_date, trip.end_date)}
        </Text>
      </LinearGradient>

      <View style={styles.bannerFooter}>
        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, { color: colors.muted }]}>
            Your trip is {trip.progress_percent}% complete
          </Text>
          <Text style={[styles.progressPercent, { color: colors.text }]}>{trip.progress_percent}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
          <View
            style={[styles.progressFill, { backgroundColor: colors.tint, width: `${Math.max(4, trip.progress_percent)}%` }]}
          />
        </View>
        <Pressable
          onPress={() => router.push(`/trips/${trip.id}`)}
          style={[styles.bannerButton, { backgroundColor: colors.tint, marginTop: 14 }]}
        >
          <Ionicons name="navigate" size={15} color={colors.onBrand} />
          <Text style={[styles.bannerButtonText, { color: colors.onBrand }]}>View trip</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Once a trip is over, a small pop-up floats in asking how it went. Tapping it
 *  opens a sheet to write about the trip — or skip, which means we never ask
 *  about that trip again. */
function ExperiencePrompt({
  trip,
  xpEarned,
  colors,
  onDone,
}: {
  trip: Trip;
  xpEarned: number;
  colors: (typeof Colors)['light'];
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
          style={[styles.promptPill, { backgroundColor: colors.card, borderColor: colors.tint }]}
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
              <Text style={{ color: colors.muted, fontSize: 11 }}>Skip and we won't ask about this trip again.</Text>
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
                  style={[styles.bannerButton, { backgroundColor: colors.tint, opacity: busy || !ready ? 0.5 : 1 }]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.onBrand} />
                  ) : (
                    <Text style={[styles.bannerButtonText, { color: colors.onBrand }]}>Share my experience</Text>
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

type IconName = keyof typeof Ionicons.glyphMap;

function StatTile({
  icon,
  tone,
  value,
  label,
  colors,
}: {
  icon: IconName;
  tone: 'tint' | 'success' | 'accent';
  value: number;
  label: string;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon} size={18} color={colors[tone]} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function Section({ title, colors, children }: { title: string; colors: (typeof Colors)['light']; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  greetingLine: { fontSize: 14, marginBottom: 2 },
  headline: { fontSize: 24, fontWeight: '800', marginBottom: 16 },

  actionsRow: { gap: 10, marginBottom: 18 },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  actionPrimary: {},
  actionText: { fontSize: 15, fontWeight: '700' },

  stats: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  statTile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },

  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },

  banner: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 18 },
  bannerCover: { padding: 16, minHeight: 150, justifyContent: 'flex-end' },
  bannerEmoji: { position: 'absolute', top: 14, right: 16, fontSize: 34, opacity: 0.85 },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveChipText: { fontSize: 11, fontWeight: '700' },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  bannerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  bannerFooter: { padding: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 12 },
  progressPercent: { fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  bannerButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  bannerButtonText: { fontSize: 14, fontWeight: '700' },

  promptPill: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
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

  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  emptyLine: { fontSize: 13, textAlign: 'center', marginBottom: 18 },
  emptyButton: { borderRadius: 999, paddingHorizontal: 24, paddingVertical: 13 },
});
