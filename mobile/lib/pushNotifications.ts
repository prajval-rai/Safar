import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { api } from './api';
import { useAuth } from './auth';

/**
 * Real push notifications for the mobile app — separate from the in-app
 * notification list (always works) and from the website's Web Push (a
 * different mechanism entirely). Requires a real device build: Expo Go
 * dropped remote push support for Android in SDK 53, and simulators/
 * emulators can't receive push at all. Every function here is written to
 * fail quietly rather than crash the app when that's not available yet —
 * the in-app bell keeps working regardless.
 */

// Shown while the app is open and in the foreground — otherwise a push
// that arrives while you're already looking at the app would be invisible.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators/emulators have no real push capability at all.
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Only resolvable once this project is linked to EAS (`eas init` /
  // `eas build:configure`) — until then this throws, which is expected and
  // caught by the caller, not a bug to chase.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/** Registers (or refreshes) this device's push token with the backend once
 *  someone's signed in. Silently does nothing if push isn't available yet
 *  (Expo Go, a simulator, no EAS project linked) — this is expected during
 *  everyday development, not an error worth surfacing to a traveller. */
export function useRegisterPushNotifications() {
  const { user } = useAuth();
  const registered = useRef(false);

  useEffect(() => {
    if (!user || registered.current) return;
    registered.current = true;

    getExpoPushToken()
      .then((token) => {
        if (!token) return;
        return api('/api/push/expo/register/', {
          method: 'POST',
          body: { token, device_name: `${Device.modelName ?? Platform.OS}` },
        });
      })
      .catch(() => {
        // Push just isn't available in this environment right now — the
        // in-app bell is unaffected either way.
      });
  }, [user]);
}

/** Tapping a push notification (from the lock screen, a notification
 *  shade, or while the app's open) navigates straight to whatever it was
 *  about, using the same `data.url` shape the backend already sends for
 *  Web Push (e.g. "/trips/<id>"). Call once, near the root of the app. */
export function useHandlePushNotificationTaps() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url !== '/') {
        router.push(url as never);
      }
    });
    return () => subscription.remove();
  }, []);
}
