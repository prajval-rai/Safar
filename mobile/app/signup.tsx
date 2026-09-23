import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Same set as frontend/src/app/(auth)/signup/page.tsx's AVATARS.
const AVATARS = ['🧳', '🏍️', '📸', '⛰️', '🌴', '🍛', '🚂', '🪂', '🧭', '🎒'];

export default function SignupScreen() {
  const { register } = useAuth();
  const colors = Colors[useColorScheme()];
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = displayName.trim().length > 0 && username.trim().length > 0 && password.length > 0;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await register({
        username: username.trim().toLowerCase(),
        password,
        display_name: displayName.trim(),
        home_city: homeCity.trim(),
        avatar_emoji: avatar,
      });
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Couldn't create your account right now.");
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
      <Link href="/login">
        <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 13 }}>← Back to log in</Text>
      </Link>

      <Text style={[styles.headline, { color: colors.text }]}>Let&apos;s get you packed</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Takes about a minute.</Text>

      {error ? (
        <Text style={[styles.errorBanner, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>{error}</Text>
      ) : null}

      <Field label="Your name" required colors={colors}>
        <TextInput style={inputStyle} value={displayName} onChangeText={setDisplayName} placeholder="Prajwal Rai" placeholderTextColor={colors.muted} />
      </Field>

      <Field label="Username" required hint="Friends use this to add you to a trip." colors={colors}>
        <TextInput
          style={inputStyle}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          placeholder="prajwal"
          placeholderTextColor={colors.muted}
        />
      </Field>

      <Field label="Password" required hint="At least 8 characters." colors={colors}>
        <TextInput style={inputStyle} secureTextEntry value={password} onChangeText={setPassword} />
      </Field>

      <Field label="Home city" colors={colors}>
        <TextInput style={inputStyle} value={homeCity} onChangeText={setHomeCity} placeholder="Pune" placeholderTextColor={colors.muted} />
      </Field>

      <Text style={[styles.label, { color: colors.text }]}>Pick an avatar</Text>
      <View style={styles.avatarRow}>
        {AVATARS.map((emoji) => {
          const selected = avatar === emoji;
          return (
            <Pressable
              key={emoji}
              onPress={() => setAvatar(emoji)}
              style={[
                styles.avatarOption,
                { borderColor: selected ? colors.tint : colors.border, backgroundColor: selected ? colors.brandSoft : colors.card },
              ]}
            >
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.button, { backgroundColor: colors.tint, opacity: busy || !canSubmit ? 0.6 : 1 }]}
        onPress={onSubmit}
        disabled={busy || !canSubmit}
      >
        {busy ? <ActivityIndicator color={colors.onBrand} /> : (
          <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: 16 }}>Create account</Text>
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
    </ScrollView>
  );
}

function Field({
  label,
  required,
  hint,
  colors,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  colors: (typeof Colors)['light'];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 40, paddingBottom: 40 },
  headline: { fontSize: 24, fontWeight: '800', marginTop: 18 },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 20 },
  errorBanner: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontWeight: '600', marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 11, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  avatarOption: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '600' },
});
