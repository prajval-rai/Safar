import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageStyle } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { TripCover } from '@/components/TripCover';
import { useColorScheme } from '@/components/useColorScheme';
import Colors, { type Palette } from '@/constants/Colors';
import type { CoverKey } from '@/lib/types';

export type IconName = keyof typeof Ionicons.glyphMap;

export function usePalette(): Palette {
  return Colors[useColorScheme()];
}

/** A remote picture, cached on disk and in memory (expo-image) so scrolling
 *  back up, or opening a screen again, never re-downloads it. Falls back to
 *  the illustrated cover when there's no photo. */
export function Photo({
  uri,
  cover,
  style,
  radius = 0,
}: {
  uri?: string | null;
  cover?: CoverKey | string;
  style?: StyleProp<ImageStyle>;
  radius?: number;
}) {
  if (!uri) {
    return <TripCover cover={(cover as CoverKey) ?? 'mountain'} radius={radius} style={(style ?? undefined) as object} />;
  }
  return (
    <Image
      source={{ uri }}
      style={[{ borderRadius: radius }, style]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={uri}
    />
  );
}

/** The scrolling row of rounded pills under a header — the selected one in
 *  the highlight colour. */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  style,
  floating,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Over a map: white pills with a soft shadow. */
  floating?: boolean;
}) {
  const colors = usePalette();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.pills, style]}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.pill,
              { backgroundColor: active ? colors.highlight : colors.card },
              floating && styles.shadow,
            ]}
          >
            <Text style={[styles.pillText, { color: active ? colors.onHighlight : colors.text }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A round icon button — the search and bell in the header. */
export function CircleButton({
  icon,
  onPress,
  badge,
  label,
  tone = 'card',
}: {
  icon: IconName;
  onPress: () => void;
  badge?: number;
  label: string;
  tone?: 'card' | 'highlight' | 'nav';
}) {
  const colors = usePalette();
  const bg = tone === 'highlight' ? colors.highlight : tone === 'nav' ? colors.nav : colors.card;
  const fg = tone === 'highlight' ? colors.onHighlight : tone === 'nav' ? colors.onNav : colors.text;
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={[styles.circle, { backgroundColor: bg }]} hitSlop={4}>
      <Ionicons name={icon} size={20} color={fg} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.card }]}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Avatar({ emoji, size = 44, ring }: { emoji: string; size?: number; ring?: boolean }) {
  const colors = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2.5 : 0,
        borderColor: colors.highlight,
      }}
    >
      <Text style={{ fontSize: size * 0.48 }}>{emoji}</Text>
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  floating,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  floating?: boolean;
}) {
  const colors = usePalette();
  return (
    <View style={[styles.search, { backgroundColor: colors.card }, floating && styles.shadow]}>
      <Ionicons name="search" size={19} color={colors.muted} />
      <TextInput
        style={[styles.searchInput, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = usePalette();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The main call to action: a highlight-coloured pill. */
export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled,
  children,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const colors = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primary, { backgroundColor: colors.highlight, opacity: disabled ? 0.55 : 1 }]}
    >
      {children ?? (
        <>
          {icon ? <Ionicons name={icon} size={18} color={colors.onHighlight} /> : null}
          <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 15 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  pills: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  pillText: { fontSize: 14, fontWeight: '600' },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, paddingHorizontal: 18, height: 52 },
  searchInput: { flex: 1, fontSize: 15 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 22,
  },
});
