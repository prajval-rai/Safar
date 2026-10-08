import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ErrorState, Loading } from '@/components/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReminderCard } from '@/components/trip/ReminderCard';
import { TripChecklist } from '@/components/trip/TripChecklist';
import { TripMoney } from '@/components/trip/TripMoney';
import { TripPhotos } from '@/components/trip/TripPhotos';
import { Avatar, Photo, PillTabs, type IconName } from '@/components/ui';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/lib/auth';
import { ApiError, api } from '@/lib/api';
import {
  CATEGORY_ICONS,
  clockTime,
  dateRange,
  PACE_LABELS,
  rupees,
  shortDate,
  statusBadge,
  TRANSPORT_ICONS,
  TRANSPORT_LABELS,
  TRIP_TYPE_LABELS,
  stopXpLabel,
} from '@/lib/format';
import { checkInStop, completeStop, getPosition, isPinned } from '@/lib/geo';
import type { Activity, Day, TripDetail } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type MainTab = 'overview' | 'itinerary' | 'photos' | 'money' | 'checklist' | 'people';
/** Everything about the trip, one pill each. Chat opens full screen. */
const MAIN_TABS: { value: MainTab | 'chat'; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'itinerary', label: 'Plan' },
  { value: 'chat', label: 'Chat' },
  { value: 'photos', label: 'Photos' },
  { value: 'money', label: 'Money' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'people', label: 'People' },
];

export default function TripDetailScreen() {
  const colors = Colors[useColorScheme()];
  // `?tab=checklist` (from a checklist reminder) opens straight on that tab.
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState<MainTab>(
    MAIN_TABS.some((t) => t.value === initialTab && t.value !== 'chat') ? (initialTab as MainTab) : 'overview',
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const { data: trip, loading, refreshing, error, refresh } = useFetch<TripDetail>(id ? `/api/trips/${id}/` : null, {
    refetchOnFocusAfter: 5_000,
  });

  if (loading && !trip) return <Loading />;
  if (error && !trip) return <ErrorState message={error} onRetry={refresh} />;
  if (!trip) return null;

  const canEdit = trip.my_role === 'owner' || trip.my_role === 'admin';
  const badge = statusBadge(trip.status);

  async function lifecycle(action: 'start' | 'reopen', message: string) {
    setLifecycleBusy(true);
    try {
      // Where you are when you start is the start point: the first stop's
      // distance XP is measured from here. Without it the trip still starts.
      let body: object = {};
      if (action === 'start') {
        try {
          body = await getPosition();
        } catch {
          // No location — the first leg just earns nothing.
        }
      }
      await api(`/api/trips/${trip!.id}/${action}/`, { method: 'POST', body });
      Alert.alert('', message);
      refresh();
    } catch (e) {
      Alert.alert('Couldn\'t do that', e instanceof ApiError ? e.message : 'Try again in a moment.');
    } finally {
      setLifecycleBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      // `refreshing` (not `loading`): on Android the spinner only stops when
      // this flips back to false, and `loading` never flips on a pull.
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.tint} />}
    >
      <View style={[styles.cover, { height: 280 + insets.top }]}>
        <Photo uri={trip.cover_image} cover={trip.cover_key} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
        <View style={styles.coverOverlay}>
          <View style={[styles.badge, { backgroundColor: trip.status === 'active' ? colors.highlight : 'rgba(255,255,255,0.95)' }]}>
            <Text style={{ color: '#17191c', fontWeight: '800', fontSize: 12 }}>
              {badge.mark} {badge.label}
            </Text>
          </View>
          <Text style={styles.coverTitle}>{trip.title}</Text>
          <View style={styles.coverPlace}>
            <Ionicons name="location" size={14} color="#fff" />
            <Text style={styles.coverSubtitle} numberOfLines={1}>
              {trip.destination}
              {trip.region ? `, ${trip.region}` : ''} · {dateRange(trip.start_date, trip.end_date)}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips'))}
          accessibilityLabel="Back"
          style={[styles.roundButton, { top: insets.top + 8, left: 16 }]}
        >
          <Ionicons name="chevron-back" size={22} color="#17191c" />
        </Pressable>
        <Pressable
          onPress={() => setMoreOpen(true)}
          accessibilityLabel="More"
          style={[styles.roundButton, { top: insets.top + 8, right: 16 }]}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#17191c" />
        </Pressable>
      </View>

      <View style={styles.body}>
        {trip.status === 'planning' && canEdit ? (
          <View style={[styles.banner, { backgroundColor: colors.card }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>Ready to go?</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                Start the trip to begin tracking it. Only one trip can be live at a time.
              </Text>
            </View>
            <Pressable
              onPress={() => lifecycle('start', 'Trip started. Have a good one!')}
              disabled={lifecycleBusy}
              style={[styles.bannerButton, { backgroundColor: colors.highlight }]}
            >
              {lifecycleBusy ? (
                <ActivityIndicator color={colors.onHighlight} size="small" />
              ) : (
                <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 13 }}>Start trip</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {trip.status === 'cancelled' ? (
          <View style={[styles.banner, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 14 }}>This trip was cancelled</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Nothing can be ticked off while it&apos;s cancelled.</Text>
            </View>
            {canEdit ? (
              <Pressable
                onPress={() => lifecycle('reopen', 'Trip reopened.')}
                disabled={lifecycleBusy}
                style={[styles.bannerButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Reopen</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <PillTabs
          options={MAIN_TABS}
          value={tab}
          onChange={(value) =>
            value === 'chat'
              ? router.push({ pathname: '/chat/[tripId]', params: { tripId: trip.id, title: trip.title } } as never)
              : setTab(value)
          }
          style={{ paddingHorizontal: 0, marginBottom: 16 }}
        />

        {tab === 'overview' ? <Overview trip={trip} canEdit={canEdit} onGo={setTab} onChanged={refresh} /> : null}
        {tab === 'itinerary' ? (
          <ItineraryTab trip={trip} myId={user?.id} canEdit={canEdit} onChanged={refresh} />
        ) : null}
        {tab === 'photos' ? <TripPhotos tripId={trip.id} canAdd={trip.status !== 'cancelled'} /> : null}
        {tab === 'money' ? <TripMoney tripId={trip.id} /> : null}
        {tab === 'checklist' ? <TripChecklist tripId={trip.id} /> : null}
        {tab === 'people' ? <People trip={trip} /> : null}
      </View>

      <MoreSheet trip={trip} visible={moreOpen} onClose={() => setMoreOpen(false)} />
    </ScrollView>
  );
}

/* --------------------------------------------------------------- overview */

function Overview({
  trip,
  canEdit,
  onGo,
  onChanged,
}: {
  trip: TripDetail;
  canEdit: boolean;
  onGo: (tab: MainTab) => void;
  onChanged: () => void;
}) {
  const colors = Colors[useColorScheme()];
  const [budgetOpen, setBudgetOpen] = useState(false);

  const allActivities = trip.days.flatMap((d) => d.activities.map((a) => ({ ...a, date: d.date })));
  const completedCount = allActivities.filter((a) => a.status === 'completed').length;
  const nextUp = allActivities.find((a) => a.status === 'planned');
  const total = trip.budget_per_person * trip.member_count;

  return (
    <View>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.highlight, width: `${Math.max(4, trip.progress_percent)}%` },
            ]}
          />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          {completedCount} of {trip.activity_count} activities done · {trip.total_xp.toLocaleString('en-IN')} XP earned so far
        </Text>
      </View>

      <ReminderCard trip={trip} canEdit={canEdit} onChanged={onChanged} />

      <View style={styles.statGrid}>
        <StatTile icon="calendar-outline" value={trip.duration_days} label="Days" colors={colors} />
        <StatTile icon="location-outline" value={trip.activity_count} label="Stops" colors={colors} />
        <StatTile icon="people-outline" value={trip.member_count} label="Going" colors={colors} />
        <StatTile icon="star-outline" value={trip.planned_xp} label="XP on offer" colors={colors} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={styles.cardLabel}>Budget</Text>
        {trip.budget_per_person ? (
          <>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 }}>
              {rupees(trip.budget_per_person)} <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>each</Text>
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
              About {rupees(total)} for {trip.member_count} {trip.member_count === 1 ? 'person' : 'people'}
            </Text>
          </>
        ) : (
          <Text style={{ color: colors.text, fontSize: 14, marginTop: 4 }}>No budget yet. Set one to keep spending in check.</Text>
        )}
        {canEdit ? (
          <Pressable onPress={() => setBudgetOpen(true)} style={[styles.smallButton, { backgroundColor: colors.raised }]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>
              {trip.budget_per_person ? 'Edit budget' : 'Set budget'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {nextUp ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={styles.cardLabel}>Next up</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 }}>{nextUp.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {shortDate(nextUp.date)}
            {nextUp.place_name ? ` · ${nextUp.place_name}` : ''}
          </Text>
          <Pressable onPress={() => onGo('itinerary')} style={[styles.smallButton, { backgroundColor: colors.raised }]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>See the full plan</Text>
          </Pressable>
        </View>
      ) : null}

      {trip.summary ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={styles.cardLabel}>About this trip</Text>
          <Text style={{ color: colors.text, fontSize: 15, marginTop: 4 }}>{trip.summary}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={styles.cardLabel}>Who&apos;s coming</Text>
        <View style={styles.memberRow}>
          {trip.members.map((m) => (
            <View key={m.id} style={[styles.memberChip, { backgroundColor: colors.raised }]}>
              <Avatar emoji={m.user.avatar_emoji} size={28} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{m.user.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={styles.cardLabel}>Trip details</Text>
        <View style={styles.factGrid}>
          <Fact label="Kind of trip" value={TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type} colors={colors} />
          <Fact label="Pace" value={PACE_LABELS[trip.pace] ?? trip.pace} colors={colors} />
          <Fact label="Getting around" value={`${TRANSPORT_ICONS[trip.transport] ?? ''} ${TRANSPORT_LABELS[trip.transport] ?? trip.transport}`} colors={colors} />
          <Fact label="Organised by" value={trip.created_by.name} colors={colors} />
        </View>
      </View>

      <BudgetModal
        visible={budgetOpen}
        initial={trip.budget_per_person}
        onClose={() => setBudgetOpen(false)}
        onSaved={onChanged}
        tripId={trip.id}
      />
    </View>
  );
}

function StatTile({ icon, value, label, colors }: { icon: IconName; value: number; label: string; colors: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card }]}>
      <View style={[styles.statIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={icon} size={17} color={colors.tint} />
      </View>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 6 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function Fact({ label, value, colors }: { label: string; value: string; colors: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.fact, { backgroundColor: colors.raised }]}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function BudgetModal({
  visible,
  initial,
  tripId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: number;
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = Colors[useColorScheme()];
  const [amount, setAmount] = useState(String(initial || ''));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/trips/${tripId}/`, { method: 'PATCH', body: { budget_per_person: Number(amount) || 0 } });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Couldn\'t save that', e instanceof ApiError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Trip budget</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>How much each person plans to spend.</Text>
          <TextInput
            style={[styles.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 12000"
            placeholderTextColor={colors.muted}
          />
          <View style={styles.presetRow}>
            {[5000, 10000, 20000, 50000].map((v) => (
              <Pressable key={v} onPress={() => setAmount(String(v))} style={[styles.preset, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>₹{v.toLocaleString('en-IN')}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={save} disabled={busy} style={[styles.submit, { backgroundColor: colors.highlight, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onHighlight} /> : <Text style={{ color: colors.onHighlight, fontWeight: '800' }}>Save budget</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* -------------------------------------------------------------- itinerary */

function ItineraryTab({
  trip,
  myId,
  canEdit,
  onChanged,
}: {
  trip: TripDetail;
  myId: number | undefined;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const colors = Colors[useColorScheme()];
  if (!trip.days.length) {
    return (
      <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 20, fontSize: 13 }}>
        No days yet.
      </Text>
    );
  }
  return (
    <View>
      {trip.days.map((day) => (
        <DaySection key={day.id} day={day} myId={myId} canEdit={canEdit} onChanged={onChanged} />
      ))}
    </View>
  );
}

function DaySection({ day, myId, canEdit, onChanged }: { day: Day; myId: number | undefined; canEdit: boolean; onChanged: () => void }) {
  const colors = Colors[useColorScheme()];
  return (
    <View style={styles.daySection}>
      <View style={styles.dayHeader}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
          Day {day.index} · {shortDate(day.date)}
        </Text>
        {day.is_complete ? (
          <View style={[styles.dayDone, { backgroundColor: colors.successSoft }]}>
            <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>✓ Done</Text>
          </View>
        ) : null}
      </View>
      {day.activities.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 4 }}>Nothing planned yet.</Text>
      ) : (
        day.activities.map((a) => <ActivityCard key={a.id} activity={a} myId={myId} canEdit={canEdit} onChanged={onChanged} />)
      )}
    </View>
  );
}

function ActivityCard({
  activity,
  myId,
  canEdit,
  onChanged,
}: {
  activity: Activity;
  myId: number | undefined;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const colors = Colors[useColorScheme()];
  const [busy, setBusy] = useState(false);
  const pinned = isPinned(activity);

  async function mark() {
    setBusy(true);
    try {
      await completeStop(activity);
      onChanged();
    } catch (e) {
      Alert.alert('Couldn\'t mark that done', e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    setBusy(true);
    try {
      await checkInStop(activity);
      Alert.alert('', 'Checked in.');
      onChanged();
    } catch (e) {
      Alert.alert('Couldn\'t check in', e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.activityCard, { backgroundColor: colors.card }]}>
      <View style={styles.activityHeader}>
        <View style={[styles.activityIcon, { backgroundColor: colors.raised }]}>
          <Text style={{ fontSize: 18 }}>{CATEGORY_ICONS[activity.category]}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{activity.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {activity.start_time ? clockTime(activity.start_time) : 'Any time'}
            {activity.place_name ? ` · ${activity.place_name}` : ''}
          </Text>
        </View>
        <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 12 }}>{stopXpLabel(activity)}</Text>
      </View>

      {activity.status === 'completed' ? (
        <View style={[styles.doneBadge, { backgroundColor: colors.successSoft }]}>
          <Text style={{ color: colors.success, fontSize: 12, fontWeight: '700' }}>
            ✓ Completed{activity.verified_by_location ? ' · confirmed by location' : ''}
          </Text>
        </View>
      ) : (
        <View style={styles.activityActions}>
          {pinned && !activity.checked_in_at ? (
            <Pressable onPress={checkIn} disabled={busy} style={[styles.pillButton, { backgroundColor: colors.raised, opacity: busy ? 0.6 : 1 }]}>
              <Ionicons name="location" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Check in</Text>
            </Pressable>
          ) : null}
          {canEdit ? (
            <Pressable onPress={mark} disabled={busy} style={[styles.pillButton, { backgroundColor: colors.highlight, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator size="small" color={colors.onHighlight} /> : (
                <>
                  <Ionicons name="checkmark" size={15} color={colors.onHighlight} />
                  <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 13 }}>Mark complete</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 12, alignSelf: 'center' }}>
              The organiser marks it done; check in to earn it.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ people */

function People({ trip }: { trip: TripDetail }) {
  const colors = Colors[useColorScheme()];
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      {trip.members.map((m, i) => (
        <View
          key={m.id}
          style={[styles.personRow, i < trip.members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
        >
          <Pressable onPress={() => router.push(`/u/${m.user.username}`)}>
            <Avatar emoji={m.user.avatar_emoji} size={42} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{m.user.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {m.role === 'owner' ? 'Organiser' : m.role === 'admin' ? 'Co-planner' : 'Traveller'} · {m.progress_percent}% done
            </Text>
          </View>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 12 }}>{m.xp_earned} XP</Text>
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------- more */

function MoreSheet({ trip, visible, onClose }: { trip: TripDetail; visible: boolean; onClose: () => void }) {
  const colors = Colors[useColorScheme()];
  const { user, refreshUser } = useAuth();

  // Spell out exactly what leaving means — including the XP — before doing it.
  function confirmLeave() {
    if (trip.leave_penalty === null) return;
    const cost = Math.abs(trip.leave_penalty);
    const xpNow = user?.xp ?? 0;
    const lines = [
      cost
        ? `−${cost} XP: ${trip.status === 'active' ? 'this trip is already under way' : "this trip hasn't started yet"}. Your total goes from ${xpNow} to ${Math.max(0, xpNow - cost)} XP.`
        : 'Free, since this trip was cancelled.',
      "• You'll lose access to the plan, chat, expenses and memories.",
      '• XP you already earned on this trip stays yours.',
      `• ${trip.created_by.name} will be told you left; stops you were looking after go back to the group.`,
      "• You can rejoin with the invite code, but the XP isn't given back.",
    ];
    onClose();
    Alert.alert(`Leave ${trip.title}?`, lines.join('\n\n'), [
      { text: 'Stay on the trip', style: 'cancel' },
      {
        text: cost ? `Leave (−${cost} XP)` : 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/api/trips/${trip.id}/leave/`, { method: 'POST', body: {} });
            await refreshUser();
            router.replace('/(tabs)/trips');
          } catch (e) {
            Alert.alert("Couldn't leave the trip", e instanceof ApiError ? e.message : 'Try again.');
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.modalTitle, { color: colors.text }]}>More</Text>
          <View style={[styles.moreItem, { backgroundColor: colors.raised }]}>
            <Ionicons name="ticket-outline" size={20} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>Invite code</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 2, marginLeft: 'auto' }}>
              {trip.join_code}
            </Text>
          </View>
          {trip.leave_penalty !== null ? (
            <Pressable onPress={confirmLeave} style={[styles.moreItem, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="exit-outline" size={20} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 14 }}>Leave trip</Text>
              {trip.leave_penalty ? (
                <Text style={{ color: colors.danger, fontSize: 11, marginLeft: 'auto' }}>{trip.leave_penalty} XP</Text>
              ) : null}
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cover: { justifyContent: 'flex-end', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  coverOverlay: { padding: 20, paddingBottom: 24 },
  roundButton: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 10 },
  coverTitle: { color: '#fff', fontSize: 26, fontWeight: '800' },
  coverPlace: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  coverSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 14, flexShrink: 1 },
  body: { padding: 16 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 16, marginBottom: 14 },
  bannerButton: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },

  card: { borderRadius: 24, padding: 18, marginBottom: 12 },
  cardLabel: { fontSize: 13, fontWeight: '700', color: '#8a8f96' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statTile: { width: '23%', flexGrow: 1, borderRadius: 22, paddingVertical: 14, alignItems: 'center' },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  smallButton: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 12 },
  pillButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },

  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingRight: 12, paddingLeft: 4, paddingVertical: 4 },
  memberAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  fact: { width: '47%', flexGrow: 1, borderRadius: 12, padding: 10 },

  daySection: { marginBottom: 20 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dayDone: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },

  activityCard: { borderRadius: 22, padding: 14, marginBottom: 10 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  activityIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  doneBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  activityActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  completeButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  preset: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  submit: { borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  moreItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16, marginTop: 10 },
});
