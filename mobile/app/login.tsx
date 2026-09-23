import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { login } = useAuth();
  const colors = Colors[useColorScheme()];
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      // Surface the real reason, not just a generic line — a network-level
      // failure (TLS, DNS, connection reset) throws a plain Error whose
      // message is the only clue anyone has to go on, so show it rather
      // than hiding it behind "couldn't sign you in".
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Couldn't sign you in just now.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.compass}>🧭</Text>
      <Text style={[styles.brand, { color: colors.text }]}>Safar</Text>

      <Text style={[styles.headline, { color: colors.text }]}>Ready for the journey?</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Log in to pick up where you left off.</Text>

      {error ? (
        <Text style={[styles.errorBanner, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>{error}</Text>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>Username</Text>
      <TextInput
        style={inputStyle}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      <Text style={[styles.label, { color: colors.text }]}>Password</Text>
      <TextInput style={inputStyle} secureTextEntry value={password} onChangeText={setPassword} />

      <Pressable
        style={[styles.button, { backgroundColor: colors.tint, opacity: busy || !username || !password ? 0.6 : 1 }]}
        onPress={onSubmit}
        disabled={busy || !username || !password}
      >
        {busy ? <ActivityIndicator color={colors.onBrand} /> : (
          <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 16 }}>Log in</Text>
        )}
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.muted }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>
      <GoogleSignInButton
        onSuccess={() => router.replace('/(tabs)')}
        onError={(message) => setError(message)}
      />

      <Text style={[styles.footerLine, { color: colors.muted }]}>
        New here?{' '}
        <Link href="/signup">
          <Text style={{ color: colors.tint, fontWeight: '700' }}>Create an account</Text>
        </Link>
      </Text>

      <View style={[styles.demo, { borderColor: colors.border, backgroundColor: colors.raised }]}>
        <Text style={[styles.demoTitle, { color: colors.text }]}>Try the demo</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Username <Text style={{ fontWeight: '700' }}>prajwal</Text> · Password{' '}
          <Text style={{ fontWeight: '700' }}>safar1234</Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '600' },
  compass: { fontSize: 30, textAlign: 'center' },
  brand: { fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 6, marginBottom: 22 },
  headline: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 20 },
  errorBanner: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 14 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  footerLine: { textAlign: 'center', marginTop: 20, fontSize: 13 },
  demo: { marginTop: 28, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center', gap: 3 },
  demoTitle: { fontSize: 12, fontWeight: '700' },
});
