import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
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

/** The Web application OAuth client (same as the website's). Every ID token
 *  is issued for this client, so the backend checks one audience whichever
 *  way the traveller signed in. */
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/** Expo Go can't load native modules, so it keeps the browser flow. */
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

interface Props {
  /** The auth context's `user` is already updated by the time this fires —
   *  this is just the screen's cue to navigate, same as after a normal login. */
  onSuccess: () => void;
  onError: (message: string) => void;
}

/**
 * "Continue with Google", posting Google's ID token to the same backend
 * endpoint the website's button uses (/api/auth/google/) — one account,
 * either way in.
 *
 * In a real build (the APK) this is native Google Sign-In: Android's own
 * account picker, no browser and no redirect. The browser flow can't work
 * there — Google blocks sending a Web client's sign-in back to an app's
 * custom scheme (in.safar.app://…), which is the "Access blocked" error.
 * Native sign-in needs an *Android* OAuth client in Google Cloud for the
 * package in.safar.app and the APK's signing SHA-1; `webClientId` still
 * names the Web client, so the ID token's audience is unchanged.
 *
 * Expo Go can't run the native module, so there it falls back to the
 * expo-auth-session browser flow, which works through Expo's own redirect.
 */
export function GoogleSignInButton(props: Props) {
  if (!GOOGLE_CLIENT_ID) return null;
  return IN_EXPO_GO ? <BrowserGoogleButton {...props} /> : <NativeGoogleButton {...props} />;
}

function NativeGoogleButton({ onSuccess, onError }: Props) {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    // Required lazily: importing it at the top would crash Expo Go, which
    // doesn't have the native module.
    type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require('@react-native-google-signin/google-signin') as GoogleSignInModule;
    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = native;
    setBusy(true);
    try {
      GoogleSignin.configure({
        webClientId: GOOGLE_CLIENT_ID,
        // iPhone signs in through its own iOS client (app.json → extra); the
        // token is still issued for the Web client, which the backend checks.
        iosClientId: Constants.expoConfig?.extra?.googleIosClientId,
      });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // They backed out of the account picker.
      const idToken = response.data.idToken;
      if (!idToken) {
        onError("Google didn't return a usable sign-in token.");
        return;
      }
      await loginWithGoogle(idToken);
      onSuccess();
    } catch (e: unknown) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return;
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          onError('Google Play services is needed to sign in with Google on this phone.');
          return;
        }
        // DEVELOPER_ERROR (code 10) means the Android OAuth client is
        // missing or its SHA-1 doesn't match this build's signing key.
        onError(`Couldn't sign in with Google (${e.code}).`);
        return;
      }
      onError(e instanceof Error ? e.message : "Couldn't sign in with Google.");
    } finally {
      setBusy(false);
    }
  }

  return <ButtonBody busy={busy} disabled={busy} onPress={signIn} />;
}

function BrowserGoogleButton({ onSuccess, onError }: Props) {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  // expo-auth-session's Google provider picks androidClientId/iosClientId/
  // webClientId based on Platform.OS, falling back to the generic `clientId`
  // only when the platform-specific one is missing — so the one Web client
  // covers Expo Go on every platform.
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

  return <ButtonBody busy={busy} disabled={!request || busy} onPress={() => promptAsync()} />;
}

function ButtonBody({ busy, disabled, onPress }: { busy: boolean; disabled: boolean; onPress: () => void }) {
  const colors = Colors[useColorScheme()];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { borderColor: colors.border, backgroundColor: colors.card, opacity: disabled ? 0.6 : 1 },
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
