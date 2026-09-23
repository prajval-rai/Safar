import { Ionicons } from '@expo/vector-icons';
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { TripCover } from '@/components/TripCover';
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
} from '@/lib/format';
import { canCompleteStop, checkInStop, completeStop, isPinned } from '@/lib/geo';
import type { Activity, Day, TripDetail } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type MainTab = 'overview' | 'itinerary' | 'people';
const MAIN_TABS: { id: MainTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📋' },
  { id: 'itinerary', label: 'Itinerary', icon: '🗓️' },
  { id: 'people', label: 'People', icon: '👥' },
];
const MORE_ITEMS = [
  { label: 'Map', icon: '🗺️' },
  { label: 'Memories', icon: '📸' },
  { label: 'Expenses', icon: '👛' },
  { label: 'Checklist', icon: '📝' },
  { label: 'Group chat', icon: '💬' },
];

export default function TripDetailScreen() {
  const colors = Colors[useColorScheme()];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState<MainTab>('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const { data: trip, loading, error, refresh } = useFetch<TripDetail>(id ? `/api/trips/${id}/` : null);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (loading && !trip) return <Loading />;
  if (error && !trip) return <ErrorState message={error} onRetry={refresh} />;
  if (!trip) return null;

  const canEdit = trip.my_role === 'owner' || trip.my_role === 'admin';
  const badge = statusBadge(trip.status);

  async function lifecycle(action: 'start' | 'reopen', message: string) {
    setLifecycleBusy(true);
    try {
      await api(`/api/trips/${trip!.id}/${action}/`, { method: 'POST' });
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
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.tint} />}
    >
      <Link href="/(tabs)/trips" style={styles.back}>
        <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 13 }}>← My Trips</Text>
      </Link>

      <TripCover cover={trip.cover_key} radius={0} style={styles.cover}>
        <View style={styles.coverOverlay}>
          <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
            <Text style={{ color: trip.status === 'active' ? colors.success : colors.tint, fontWeight: '700', fontSize: 12 }}>
              {badge.mark} {badge.label}
            </Text>
          </View>
          <Text style={styles.coverTitle}>{trip.title}</Text>
          <Text style={styles.coverSubtitle}>
            📍 {trip.destination}
            {trip.region ? `, ${trip.region}` : ''} · {dateRange(trip.start_date, trip.end_date)}
          </Text>
        </View>
      </TripCover>

      <View style={styles.body}>
        {trip.status === 'planning' && canEdit ? (
          <View style={[styles.banner, { backgroundColor: colors.brandSoft, borderColor: colors.tint }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>Ready to go?</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                Start the trip to begin tracking it. Only one trip can be live at a time.
              </Text>
            </View>
            <Pressable
              onPress={() => lifecycle('start', 'Trip started. Have a good one!')}
              disabled={lifecycleBusy}
              style={[styles.bannerButton, { backgroundColor: colors.tint }]}
            >
              {lifecycleBusy ? (
                <ActivityIndicator color={colors.onBrand} size="small" />
              ) : (
                <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 13 }}>🚀 Start trip</Text>
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

        <View style={styles.tabBar}>
          {MAIN_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[styles.tabItem, active && { borderBottomColor: colors.tint }]}
              >
                <Text style={{ color: active ? colors.tint : colors.muted, fontWeight: '700', fontSize: 13 }}>
                  {t.icon} {t.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setMoreOpen(true)} style={styles.tabItem}>
            <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 13 }}>⋯ More</Text>
          </Pressable>
        </View>

        {tab === 'overview' ? <Overview trip={trip} canEdit={canEdit} onGo={setTab} onChanged={refresh} /> : null}
        {tab === 'itinerary' ? (
          <ItineraryTab trip={trip} myId={user?.id} canEdit={canEdit} onChanged={refresh} />
        ) : null}
        {tab === 'people' ? <People trip={trip} /> : null}
      </View>

      <MoreSheet visible={moreOpen} onClose={() => setMoreOpen(false)} />
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
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: trip.status === 'completed' ? colors.success : colors.tint, width: `${Math.max(4, trip.progress_percent)}%` },
            ]}
          />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          {completedCount} of {trip.activity_count} activities done · {trip.total_xp.toLocaleString('en-IN')} XP earned so far
        </Text>
      </View>

      <View style={styles.statGrid}>
        <StatTile emoji="📅" value={trip.duration_days} label="Days" colors={colors} />
        <StatTile emoji="📍" value={trip.activity_count} label="Activities" colors={colors} />
        <StatTile emoji="👥" value={trip.member_count} label="Travelling" colors={colors} />
        <StatTile emoji="⭐" value={trip.planned_xp} label="XP on offer" colors={colors} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
          <Pressable onPress={() => setBudgetOpen(true)} style={[styles.smallButton, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>
              {trip.budget_per_person ? 'Edit budget' : 'Set budget'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {nextUp ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.cardLabel}>Next up</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 }}>{nextUp.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {shortDate(nextUp.date)}
            {nextUp.place_name ? ` · ${nextUp.place_name}` : ''}
          </Text>
          <Pressable onPress={() => onGo('itinerary')} style={[styles.smallButton, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>See the full plan</Text>
          </Pressable>
        </View>
      ) : null}

      {trip.summary ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.cardLabel}>About this trip</Text>
          <Text style={{ color: colors.text, fontSize: 15, marginTop: 4 }}>{trip.summary}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={styles.cardLabel}>Who&apos;s coming</Text>
        <View style={styles.memberRow}>
          {trip.members.map((m) => (
            <View key={m.id} style={[styles.memberChip, { backgroundColor: colors.raised }]}>
              <View style={[styles.memberAvatar, { backgroundColor: colors.brandSoft }]}>
                <Text style={{ fontSize: 13 }}>{m.user.avatar_emoji}</Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{m.user.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

function StatTile({ emoji, value, label, colors }: { emoji: string; value: number; label: string; colors: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 }}>{value}</Text>
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
          <Pressable onPress={save} disabled={busy} style={[styles.submit, { backgroundColor: colors.tint, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={{ color: colors.onBrand, fontWeight: '700' }}>Save budget</Text>}
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
  const canComplete = canCompleteStop(activity, myId, canEdit);
  const pinned = isPinned(activity);

  async function mark(override = false) {
    setBusy(true);
    try {
      await completeStop(activity, { override });
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
    <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.activityHeader}>
        <Text style={{ fontSize: 16 }}>{CATEGORY_ICONS[activity.category]}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{activity.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {activity.start_time ? clockTime(activity.start_time) : 'Any time'}
            {activity.place_name ? ` · ${activity.place_name}` : ''}
          </Text>
        </View>
        <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 12 }}>+{activity.xp_value} XP</Text>
      </View>

      {activity.status === 'completed' ? (
        <View style={[styles.doneBadge, { backgroundColor: colors.successSoft }]}>
          <Text style={{ color: colors.success, fontSize: 12, fontWeight: '700' }}>
            ✓ Completed{activity.verified_by_location ? ' · confirmed by location' : ''}
          </Text>
        </View>
      ) : !canComplete ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          Assigned to {activity.assigned_to?.name}
        </Text>
      ) : (
        <View style={styles.activityActions}>
          {activity.requires_checkin && !activity.checked_in_at ? (
            <Pressable onPress={checkIn} disabled={busy} style={[styles.smallButton, { borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>📍 Check in</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => mark(false)} disabled={busy} style={[styles.completeButton, { backgroundColor: colors.tint, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator size="small" color={colors.onBrand} /> : (
              <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 12 }}>Mark complete</Text>
            )}
          </Pressable>
          {pinned && canEdit ? (
            <Pressable onPress={() => mark(true)} disabled={busy} style={[styles.smallButton, { borderColor: colors.border, opacity: busy ? 0.6 : 1 }]}>
              <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 11 }}>Without location</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ people */

function People({ trip }: { trip: TripDetail }) {
  const colors = Colors[useColorScheme()];
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {trip.members.map((m, i) => (
        <View
          key={m.id}
          style={[styles.personRow, i < trip.members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
        >
          <View style={[styles.memberAvatar, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ fontSize: 16 }}>{m.user.avatar_emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{m.user.name}</Text>
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

function MoreSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = Colors[useColorScheme()];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>More</Text>
          {MORE_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => {
                onClose();
                Alert.alert(item.label, "This part of the trip isn't built in the mobile app yet — open it on the web for now.");
              }}
              style={[styles.moreItem, { borderColor: colors.border }]}
            >
              <Text style={{ fontSize: 18 }}>{item.icon}</Text>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{item.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 'auto' }}>Web only</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  cover: { height: 200, justifyContent: 'flex-end' },
  coverOverlay: { padding: 16, backgroundColor: 'rgba(0,0,0,0.15)' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  coverTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  coverSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
  body: { padding: 16 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  bannerButton: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },

  tabBar: { flexDirection: 'row', gap: 4, marginBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  tabItem: { paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },

  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  cardLabel: { fontSize: 12, fontWeight: '700', color: '#8a8a8a' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statTile: { width: '23%', flexGrow: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },

  smallButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },

  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingRight: 12, paddingLeft: 4, paddingVertical: 4 },
  memberAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  fact: { width: '47%', flexGrow: 1, borderRadius: 12, padding: 10 },

  daySection: { marginBottom: 20 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dayDone: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },

  activityCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  activityHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  doneBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  activityActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  completeButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  preset: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  submit: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  moreItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 },
});
