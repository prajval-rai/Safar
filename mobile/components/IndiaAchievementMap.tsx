import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { CATEGORY_ICONS } from '@/lib/format';
import { MAP_H, MAP_W, mapPins, percent, statePaths, tierFor, TOTAL_STATES, visitedStates } from '@/lib/indiaMap';
import type { TravelMapData } from '@/lib/types';

/** The mobile equivalent of frontend/src/components/social/IndiaAchievementMap.tsx.
 *  Renders on react-native-svg rather than a live Google Map — react-native-maps
 *  needs a custom development build (not supported in Expo Go), so this uses the
 *  same flat-projection approach the web app's own share-card PNG still relies
 *  on. See mobile/README.md for what upgrading to a live map would take. */
export function IndiaAchievementMap({ data }: { data: TravelMapData }) {
  const colors = Colors[useColorScheme()];
  const paths = useMemo(() => statePaths(), []);
  const visited = useMemo(() => visitedStates(data), [data]);
  const pins = useMemo(() => mapPins(data), [data]);
  const [selected, setSelected] = useState<string | null>(null);

  const count = visited.size;
  const pct = percent(count);
  const { current, next } = tierFor(count);
  const goal = next ? next.min - count : 0;

  const ranked = useMemo(
    () =>
      [...visited.entries()].sort(
        (x, y) => y[1].places.length + y[1].trips.length - (x[1].places.length + x[1].trips.length),
      ),
    [visited],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.ring, { borderColor: colors.raised }]}>
          <View style={[styles.ringFill, { borderColor: colors.tint, transform: [{ rotate: `${(pct / 100) * 360 - 90}deg` }] }]} />
          <Text style={[styles.ringPct, { color: colors.text }]}>{pct}%</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.text }]}>🏆 My India</Text>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>
            {current.emoji} {current.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {count} of {TOTAL_STATES} states &amp; UTs explored
          </Text>
        </View>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.raised }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${Math.max(4, pct)}%` }]} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>
        {next
          ? `${goal} more ${goal === 1 ? 'state' : 'states'} to become a ${next.title} ${next.emoji}`
          : "You've reached the highest rank. Sampoorna Yatri! 👑"}
      </Text>

      <View style={styles.mapWrap}>
        <Svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" height="100%">
          {paths.map((s) => {
            const done = visited.has(s.name);
            const active = selected === s.name;
            return (
              <Path
                key={s.name}
                d={s.d}
                fill={done ? colors.tint : colors.raised}
                fillOpacity={active ? 1 : done ? 0.85 : 1}
                stroke={done ? colors.brandStrong : colors.raised}
                strokeWidth={active ? 1.4 : done ? 0.8 : 0.4}
                onPress={() => setSelected((cur) => (cur === s.name ? null : s.name))}
              />
            );
          })}
          {pins.map((p) =>
            p.verified ? (
              // A stop stood at — the category's icon, same set used across the app.
              <G key={p.id} onPress={() => p.state && setSelected(p.state)}>
                <Circle cx={p.x} cy={p.y} r={3.4} fill={colors.brandStrong} stroke={colors.card} strokeWidth={0.7} />
                <SvgText x={p.x} y={p.y} fontSize={3.6} textAnchor="middle" alignmentBaseline="central">
                  {CATEGORY_ICONS[p.category ?? 'sightseeing']}
                </SvgText>
              </G>
            ) : (
              <Circle
                key={p.id}
                cx={p.x}
                cy={p.y}
                r={2}
                fill={colors.card}
                stroke={colors.brandStrong}
                strokeWidth={0.8}
                onPress={() => p.state && setSelected(p.state)}
              />
            ),
          )}
        </Svg>
      </View>
      <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 4 }}>
        Tap a state or a pin. An icon shows what kind of stop it was — {CATEGORY_ICONS.food} food,{' '}
        {CATEGORY_ICONS.adventure} adventure, {CATEGORY_ICONS.sightseeing} sightseeing… · ○ a trip destination
      </Text>

      <View style={styles.tallyRow}>
        <Tally value={data.finished?.length ?? data.areas.length} label="trips done" colors={colors} />
        <Tally value={data.places.length} label="places stood at" colors={colors} />
        <Tally value={count} label={count === 1 ? 'state' : 'states'} colors={colors} />
      </View>

      {ranked.length ? (
        <View style={styles.list}>
          <Text style={[styles.listTitle, { color: colors.text }]}>What I&apos;ve done where</Text>
          {ranked.map(([state, j]) => {
            const open = selected === state;
            return (
              <View key={state} style={[styles.stateRow, open && { backgroundColor: colors.brandSoft }]}>
                <Text
                  onPress={() => setSelected(open ? null : state)}
                  style={[styles.stateName, { color: colors.text }]}
                >
                  {state}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {j.trips.length} {j.trips.length === 1 ? 'trip' : 'trips'}
                  {j.places.length ? ` · ${j.places.length} ${j.places.length === 1 ? 'place' : 'places'}` : ''}
                </Text>
                {open && j.places.length ? (
                  <View style={styles.placeChips}>
                    {j.places.map((pl) => (
                      <View key={pl} style={[styles.placeChip, { backgroundColor: colors.successSoft }]}>
                        <Text style={{ color: colors.success, fontSize: 11, fontWeight: '600' }}>✓ {pl}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 14 }}>
          Finish a trip and the state lights up here.
        </Text>
      )}
    </View>
  );
}

function Tally({ value, label, colors }: { value: number; label: string; colors: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.tally, { backgroundColor: colors.raised }]}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  ring: { width: 56, height: 56, borderRadius: 28, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  ringFill: { position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 6, borderColor: 'transparent' },
  ringPct: { fontSize: 13, fontWeight: '800' },
  title: { fontSize: 16, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  mapWrap: { aspectRatio: 0.85, marginTop: 14, borderRadius: 12, overflow: 'hidden' },
  tallyRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tally: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  list: { marginTop: 16 },
  listTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  stateRow: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 4 },
  stateName: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  placeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  placeChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
});
