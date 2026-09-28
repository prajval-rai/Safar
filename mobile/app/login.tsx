import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/** Safar signs everyone in with Google — one button for new and returning
 *  travellers alike; the backend creates the account the first time. */
export default function LoginScreen() {
  const colors = Colors[useColorScheme()];
  const [error, setError] = useState<string | null>(null);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.compass}>🧭</Text>
      <Text style={[styles.brand, { color: colors.text }]}>Safar</Text>

      <Text style={[styles.headline, { color: colors.text }]}>Ready for the journey?</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Continue with Google — new here or coming back, it&apos;s the same one tap.
      </Text>

      {error ? (
        <Text style={[styles.errorBanner, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>{error}</Text>
      ) : null}

      {GOOGLE_CLIENT_ID ? (
        <GoogleSignInButton
          onSuccess={() => router.replace('/(tabs)')}
          onError={(message) => setError(message)}
        />
      ) : (
        <Text style={[styles.notice, { color: colors.muted, borderColor: colors.border, backgroundColor: colors.raised }]}>
          Google sign-in isn&apos;t configured. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID to enable it.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  compass: { fontSize: 30, textAlign: 'center' },
  brand: { fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 6, marginBottom: 22 },
  headline: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 20 },
  errorBanner: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 13 },
});
