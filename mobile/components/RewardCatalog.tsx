import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, Loading } from '@/components/ScreenState';
import Colors from '@/constants/Colors';
import { api, ApiError } from '@/lib/api';
import type { RewardOffer } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Palette = (typeof Colors)['light'];

/** Rewards staff put up (from the website) that travellers can claim once
 *  they've earned enough XP. Claiming doesn't spend XP. */
export function RewardCatalog({ myXp, colors }: { myXp: number; colors: Palette }) {
  const { data, loading, error, refresh } = useFetch<RewardOffer[]>('/api/rewards/catalog/');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function claim(offer: RewardOffer) {
    setBusyId(offer.id);
    try {
      await api(`/api/rewards/catalog/${offer.id}/claim/`, { method: 'POST' });
      Alert.alert('Claimed 🎁', offer.title);
      await refresh();
    } catch (e) {
      Alert.alert("Couldn't claim that", e instanceof ApiError ? e.message : 'Try again in a moment.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data?.length) {
    return <EmptyState message="No rewards up for grabs yet — keep travelling and check back soon." />;
  }

  return (
    <View style={{ gap: 12 }}>
      {data.map((offer) => {
        const progress = Math.min(100, (myXp / Math.max(offer.xp_required, 0.01)) * 100);
        const blocked = Boolean(offer.blocked_reason) || busyId === offer.id;
        return (
          <View key={offer.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {offer.image ? (
              <Image source={{ uri: offer.image }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.placeholder, { backgroundColor: colors.raised }]}>
                <Text style={{ fontSize: 40 }}>🎁</Text>
              </View>
            )}
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{offer.title}</Text>
                <Text style={{ color: colors.tint, fontWeight: '800', fontSize: 13 }}>
                  {offer.xp_required.toLocaleString('en-IN', { maximumFractionDigits: 2 })} XP
                </Text>
              </View>
              {offer.description ? <Text style={{ color: colors.muted, fontSize: 13 }}>{offer.description}</Text> : null}
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
                {offer.spots_left ? `${offer.spots_left} of ${offer.max_claims} left` : `All ${offer.max_claims} claimed`}
              </Text>
              {!offer.claimed_by_me && myXp < offer.xp_required ? (
                <View style={[styles.track, { backgroundColor: colors.raised }]}>
                  <View style={[styles.fill, { backgroundColor: colors.tint, width: `${Math.max(4, progress)}%` }]} />
                </View>
              ) : null}
              {offer.claimed_by_me ? (
                <Text style={{ color: colors.success, fontWeight: '700', fontSize: 13 }}>✓ Claimed</Text>
              ) : (
                <Pressable
                  onPress={() => claim(offer)}
                  disabled={blocked}
                  style={[styles.button, { backgroundColor: colors.tint, opacity: blocked ? 0.55 : 1 }]}
                >
                  {busyId === offer.id ? (
                    <ActivityIndicator color={colors.onBrand} />
                  ) : (
                    <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 13 }}>
                      {offer.blocked_reason || 'Claim reward'}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  image: { width: '100%', height: 150 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 999 },
  button: { borderRadius: 999, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
});
