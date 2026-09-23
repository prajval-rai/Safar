import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = Colors[useColorScheme()];
  return (
    <View style={styles.center}>
      <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
      <Pressable style={[styles.retry, { borderColor: colors.tint }]} onPress={onRetry}>
        <Text style={{ color: colors.tint, fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  const colors = Colors[useColorScheme()];
  return (
    <View style={styles.center}>
      <Text style={[styles.text, { color: colors.muted }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  text: { textAlign: 'center', fontSize: 14 },
  retry: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
});
