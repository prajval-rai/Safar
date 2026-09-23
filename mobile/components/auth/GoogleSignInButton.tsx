import { Ionicons } from '@expo/vector-icons';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/lib/auth';

// Lets the browser tab AuthSession opens hand control back to this app once
// Google redirects — without this, a successful sign-in never resolves.
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/**
 * Google's own rendered button (the one on web) only exists in a browser —
 * it's Google Identity Services' JS widget. On mobile this opens the system
 * browser instead via expo-auth-session, gets an ID token the same shape
 * Google's web widget hands the frontend, and posts it to the very same
 * backend endpoint (/api/auth/google/) — one account, either way in.
 *
 * Uses expo-auth-session/providers/google's useIdTokenAuthRequest rather
 * than a native Google Sign-In SDK specifically because it works inside
 * Expo Go — the native libraries need a custom dev build and can't run here
 * at all. Renders nothing when EXPO_PUBLIC_GOOGLE_CLIENT_ID isn't set, same
 * as the web button when its Client ID is missing.
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
}: {
  /** The auth context's `user` is already updated by the time this fires —
   *  this is just the screen's cue to navigate, same as after a normal login. */
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const colors = Colors[useColorScheme()];
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  // expo-auth-session's Google provider picks androidClientId/iosClientId/
  // webClientId based on Platform.OS, falling back to the generic `clientId`
  // only when the platform-specific one is missing. We only have one real
  // OAuth client (a Web application type, same as the website's) and no
  // separate native Android/iOS ones — passing it as `clientId` covers every
  // platform through that fallback, without duplicating it three times.
  const [request, response, promptAsync] = useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
  });

  useEffect(() => {
    if (!response || response.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) {
      onError("Google didn't return a usable sign-in token.");
      return;
    }
    setBusy(true);
    loginWithGoogle(idToken)
      .then(onSuccess)
      .catch((e: unknown) => onError(e instanceof Error ? e.message : "Couldn't sign in with Google."))
      .finally(() => setBusy(false));
    // Only ever react to a *new* response — the callbacks below aren't
    // meant to re-run this when their own identities happen to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <Pressable
      onPress={() => promptAsync()}
      disabled={!request || busy}
      style={[
        styles.button,
        { borderColor: colors.border, backgroundColor: colors.card, opacity: !request || busy ? 0.6 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color={colors.text} />
          <Text style={[styles.label, { color: colors.text }]}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
  },
  label: { fontSize: 15, fontWeight: '700' },
});
