import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePalette, type IconName } from '@/components/ui';

/** Icon per tab route (outline when idle, filled when selected). */
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['briefcase-outline', 'briefcase'],
  profile: ['person-outline', 'person'],
};

/** A light bar floating over the bottom of every tab. The selected tab grows
 *  into a highlight-coloured pill with its name; the rest are plain icons.
 *  Screens leave TAB_BAR_SPACE at the bottom of their scroll content so
 *  nothing hides behind it. */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 8 }]}>
      <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {state.routes.map((route, index) => {
          const icons = ICONS[route.name];
          if (!icons) return null; // Hidden routes (e.g. the profile) have no tab.
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;

          function onPress() {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              // The selected tab gets more room, for its name.
              style={[styles.item, { flex: focused ? 2 : 1 }]}
              hitSlop={4}
            >
              {focused ? (
                <View style={[styles.activePill, { backgroundColor: colors.highlight }]}>
                  <Ionicons name={icons[1]} size={19} color={colors.onHighlight} />
                  <Text style={[styles.activeLabel, { color: colors.onHighlight }]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              ) : (
                <Ionicons name={icons[0]} size={23} color={colors.muted} />
              )}
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
    height: 64,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    overflow: 'hidden',
  },
  activeLabel: { fontSize: 12, fontWeight: '800' },
});
