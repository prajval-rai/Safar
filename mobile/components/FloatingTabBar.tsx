import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePalette, type IconName } from '@/components/ui';

/** Icon per tab route (outline when idle, filled when selected). */
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['briefcase-outline', 'briefcase'],
  explore: ['compass-outline', 'compass'],
  profile: ['person-outline', 'person'],
};
/** The route shown as the big round button in the middle of the bar. */
const CENTER = 'explore';

/** A light bar floating over the bottom of every tab: My trips and Profile at
 *  the sides, Explore as a raised round button in the centre. Screens leave
 *  TAB_BAR_SPACE at the bottom of their scroll content so nothing hides
 *  behind it. */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 8 }]}>
      <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {state.routes.map((route, index) => {
          const icons = ICONS[route.name];
          if (!icons) return null; // Routes without a tab.
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;

          function onPress() {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }

          if (route.name === CENTER) {
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={label}
                style={styles.centerSlot}
              >
                <View style={[styles.centerButton, { backgroundColor: colors.highlight, borderColor: colors.background }]}>
                  <Ionicons name={focused ? icons[1] : icons[0]} size={30} color={colors.onHighlight} />
                </View>
                <Text style={[styles.centerLabel, { color: focused ? colors.text : colors.muted }]}>{label}</Text>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              style={styles.item}
              hitSlop={4}
            >
              <Ionicons name={focused ? icons[1] : icons[0]} size={24} color={focused ? colors.text : colors.muted} />
              <Text style={[styles.label, { color: focused ? colors.text : colors.muted, fontWeight: focused ? '800' : '600' }]}>
                {label}
              </Text>
              {focused ? <View style={[styles.dot, { backgroundColor: colors.highlight }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Bottom padding for scrolling screens, so their last item clears the bar
 *  (and Android's navigation buttons under it). */
export const TAB_BAR_SPACE = 150;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    height: 68,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 },
  label: { fontSize: 11 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', paddingBottom: 8 },
  centerButton: {
    position: 'absolute',
    top: -30,
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  centerLabel: { fontSize: 11, fontWeight: '700' },
});
