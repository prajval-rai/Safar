# Safar mobile — Android & iOS

A React Native (Expo) app for Safar, talking to the **same Django backend** as
`frontend/` over the same JWT-authenticated REST API. No backend changes were
needed beyond one dev-only setting (see below).

This first pass covers: login/signup, Home, My Trips, Explore (tracks),
Rewards, and Profile with logout — all reading real data from your API. See
**What's not built yet** below for the rest.

---

## Run it (fastest way — no Android Studio/Xcode needed)

1. Install [Expo Go](https://expo.dev/go) on your phone (Android or iOS), and
   make sure your phone is on the **same Wi-Fi network** as this computer.

2. Point the app at your backend. Edit `.env`:

   ```
   EXPO_PUBLIC_API_BASE=http://<this-machine's-LAN-IP>:8000
   ```

   Find your LAN IP with `ipconfig` (Windows, look for the Wi-Fi adapter's
   IPv4 address) — it's already set to this machine's current IP
   (`192.168.2.78`), but that can change between networks or DHCP renewals.

3. Make sure the backend is reachable from other devices on the network —
   run it bound to all interfaces, not just localhost:

   ```bash
   cd ../backend
   .venv/Scripts/python.exe manage.py runserver 0.0.0.0:8000
   ```

   `config/settings.py` was updated so the dev server (`DJANGO_DEBUG=1`,
   `DJANGO_ALLOWED_HOSTS` unset) accepts requests from any host — otherwise
   Django rejects a request whose `Host` header isn't in `ALLOWED_HOSTS`,
   which is what your phone's LAN IP request looks like to it. This only
   relaxes anything when `DJANGO_ALLOWED_HOSTS` is left unset in dev; a
   production deploy already sets it explicitly (see the root README).

4. Start the app:

   ```bash
   cd mobile
   npm start
   ```

   Scan the QR code with Expo Go (Android: in-app scanner; iOS: the Camera
   app). The app reloads live as you edit files — no rebuild needed.

Demo login: `prajwal` / `safar1234` (same seeded account as the web app).

---

## Project shape

```
mobile/
  app/                  screens, file-based routing (Expo Router)
    login.tsx, signup.tsx
    (tabs)/              the five tabs, behind the auth gate
      index.tsx           Home     → GET /api/home/
      trips.tsx            My Trips → GET /api/trips/
      explore.tsx           Explore  → GET /api/explore/tracks/
      rewards.tsx            Rewards  → GET /api/rewards/me/
      profile.tsx              Profile  → the logged-in user, sign out
  components/           TripCard, TrackCard, loading/error/empty states
  lib/
    api.ts               fetch wrapper: bearer token, 401 → refresh → retry once
    auth.tsx              AuthProvider/useAuth: login, register, logout, session restore
    types.ts                hand-mirrored subset of frontend/src/lib/types.ts
    format.ts                 date/cover-emoji helpers, mirroring the web app's
    useFetch.ts                 load-on-mount + pull-to-refresh, used by every screen
```

Tokens (`access`/`refresh`) are kept in `expo-secure-store` (the OS keychain /
Keystore), not `AsyncStorage` — same sensitivity as `localStorage` on the web
app, but on a device that can be lost or shared, so it's worth the stronger
store.

`lib/types.ts` is a **hand-copied** subset of the web app's types, not a
shared package — the two apps ship independently. If you change a serializer
on the backend, update both `frontend/src/lib/types.ts` and
`mobile/lib/types.ts`.

---

## What's not built yet

This is a foundation, not full feature parity with the web app. Still to
build, in roughly the order they'd matter:

- **Trip detail** — itinerary, activities, check-in/complete (the 1 km rule
  needs `expo-location`, not just the browser's geolocation API)
- **Create-trip wizard**
- **Live Trip mode**
- **Trip map** (`react-native-maps` or the Google Maps SDK — the web app's
  `@react-google-maps`-style JS API doesn't run in React Native)
- **Expenses, checklist, chat, photo memories**
- **Explore/Tracks actions** (like, save, use) — currently read-only
- **Profile → India achievement map**, editing profile/theme
- **Push notifications** for trip updates (`expo-notifications`)
- **Camera** for photo memories (`expo-image-picker`)

## Building an installable app (later)

Day-to-day development doesn't need this — `npm start` + Expo Go is enough.
When you want a real installable/signed build:

- **Android**: install Android Studio (for the SDK/emulator) and either
  build locally with `npx expo run:android`, or use
  [`eas build`](https://docs.expo.dev/build/introduction/) to build in
  Expo's cloud (works from Windows, no local SDK needed).
- **iOS**: needs Xcode, which only runs on macOS. Without a Mac, `eas build`
  can build the iOS app in the cloud from this same Windows machine.
