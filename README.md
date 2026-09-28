# Safar — a travel companion for Indian trips

Plan a trip with your people, follow the plan while you're actually travelling,
split what you spend, and earn XP along the way.

Three pieces, one API:

- `backend/` — Django 5 + Django REST Framework, JWT auth, SQLite locally / PostgreSQL hosted
- `frontend/` — Next.js 16 (App Router) + React 19 + Tailwind CSS 4, TypeScript
- `mobile/` — React Native (Expo) app for Android and iOS, talking to the same backend
  (see [mobile/README.md](mobile/README.md))

---

## Run it

You need **Python 3.10+** and **Node 20.9+**.

### 1. Backend (port 8000)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed --reset   # demo travellers, trips, tracks and posts
python manage.py runserver
```

### 2. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>.

### 3. Mobile (optional)

Run the backend with `python manage.py runserver 0.0.0.0:8000` so your phone can reach it, then:

```bash
cd mobile
npm install
npx expo start                  # scan the QR code with Expo Go
```

Set `EXPO_PUBLIC_API_BASE=http://<your-LAN-IP>:8000` in `mobile/.env`. An installed APK
(`eas build -p android --profile preview`) doesn't update itself — rebuild it to pick up
new screens.

### Signing in

Safar signs people in with **Google only** — there is no username/password
login. Set `GOOGLE_CLIENT_ID` on the backend and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
(web) / `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (mobile) to the same OAuth client. The
seeded demo travellers still exist for data, but you sign in as yourself; the
`admin` superuser (password `safar1234`) is only for the Django admin at
<http://localhost:8000/admin>. Give a Google account `is_staff` there to let it
manage the reward catalog.

The seeded **Jaipur Weekend** is happening *today*, so Live Trip mode has real
data in it straight away.

---

## What's in it

**Account**
- Google sign-in (web and mobile); account recovery with one security question
- Profile with level, traveller tag (e.g. "Awara"), saved theme and push settings
- Account menu on the avatar in the top-right corner: name, username, level and XP, change
  username, Rewards, *More* (the full profile page) and Log out
- Email comes from Google and can't be changed (sign-in matches accounts by it)
- **Delete account** (Profile): *temporarily* — hidden from search, profiles, the feed and the
  leaderboard until you sign in again — or *permanently*, which deletes everything that's only
  yours; group trips you organised pass to a co-planner or the next member. Both need your
  username typed to confirm
- Collapsible sidebar on laptops (remembered per browser)

**Planning**
- Six-step create-trip wizard (where → when → who → what kind → itinerary → invite)
- Smart defaults: picking "Weekend getaway" suggests 2 days; "Road trip" suggests a car
- Search anywhere in India, browse popular places by state, or *Set my own destination* on the map
- Pick interests, then *Find places* suggests matching spots to add
- "Generate day plan" fills a day from a destination template you can then edit
- Day-by-day itinerary: stops with times, costs and locations; edit, delete, reorder or move
  between days (drag-and-drop, or buttons)
- Budget, set in the wizard and editable later

**People and invites**
- Invite people by searching name, username or email — they get an **invite** (the ✉️ in the
  top bar shows how many are waiting, with the trip's details and Accept / Decline) and only join
  once they accept. Or share a 6-character code; `/join/<code>` shows a preview of the trip
- A shareable **invite card** image
- Owner / co-planner / member roles; organisers add or remove people and assign stops

**While travelling**
- *Start trip* (one live trip per person at a time)
- **Live Trip mode** — a stripped-back screen showing only NOW, NEXT, TODAY and who's with you
- Check in, mark done (organisers, for the group) and navigate (deep-links into Google Maps)
- The 1 km rule for pinned stops, checked on the server (see below)
- Map tab: numbered stops, All / Day 1 / Day 2 filters, *Drop a pin* for your own spot
- **Offline queue** — check-ins and completions made without signal are sent once you're back online
- Organisers can undo a stop, finish early, cancel or reopen

**Group tools** (a trip's "More" sheet)
- **Expenses** with an equal split and who-owes-what
- **Settle up** — suggested transfers, UPI pay links, "I paid" → the receiver confirms
- **Checklist** — shared items for the group plus each person's own; organisers track everyone
- **Group chat**, with push notifications
- **Photo memories** — the first photo becomes the trip's cover everywhere; a re-uploaded
  photo is spotted and earns nothing

**After**
- Trip completion screen with the route, the numbers and your crew
- Home asks "How was <trip>?" with the XP you earned on it; the write-up goes to the Feed
- Publish the trip as a **track** others can copy into their own trips
- A **soundtrack** for the trip — a song searched from Apple Music, with a preview player
- A **story card** image to share to Instagram

**Explore, Feed and people**
- Tracks: browse, like, save and use (copy into a new trip of your own)
- **Feed** of travel posts with likes and an Everyone / Following filter; a post detail page
- Public post pages at `/p/<id>` — anyone can open them, signed in or not
- Follow travellers; profiles at `/u/<username>`; *Find travellers to follow*
- India achievement map with a share card (see below)

**Rewards**
- XP for distance, check-ins, photos, days, trips, write-ups, tracks and achievements — and
  XP cuts for leaving or cancelling trips and for undone stops (see [XP rules](#xp-rules))
- Levels, 13 achievements, a leaderboard with a podium
- **Reward catalog** — real rewards with an XP bar and a limited number of spots; claiming
  doesn't spend XP
- A *How XP works* sheet: ways to earn, good to know, and the cuts highlighted in red.
  Tapping *Claim* without enough XP opens it with how much more you need
- A reward share card

**Notifications**
- In-app bell, **Web Push** in the browser and **Expo push** on phones
- Invites, joins and leaves, trip start, day-before and hour-before reminders, chat, settle-up,
  held XP released, new followers, achievements, your track being used, reward claims

**Admin** (staff only)
- `/manage` — add and edit rewards with a picture, and hand over claims
  (pending → delivered / rejected, with a note)
- The Django admin at `/admin`

---

## Completing stops, assignment and the travel map

**Organisers complete stops for the group.** Only the trip owner or a co-planner can mark
a stop complete, and it's then done for everyone on the trip: every member earns its XP
(and the day and trip bonuses when those finish). Travellers can still check in themselves.

**The 1 km rule.** A stop with a pin on the map can only be checked in at, or marked
complete, from within 1 km of it — there is no override and it isn't configurable. The app
asks for the device's location and the server does the distance check
(`backend/trips/geo.py`); a stop with no pin has nothing to measure and just completes.

- **Close-to-home trips earn no XP.** A trip whose destination is within 10 km of where it was
  planned (`planner_latitude` / `planner_longitude` on `POST /api/trips/`) or started from is
  still allowed, but is flagged `no_xp`: nothing on it earns or costs XP, and it doesn't count
  towards achievements (`MIN_TRIP_DISTANCE_KM` in `backend/trips/geo.py`, enforced in
  `rewards.services.award_xp`). The wizard warns when this happens. A destination typed
  without a map pin, or planned with location off, has nothing to measure until it's started.
- **Assignment.** An organiser can assign a stop to a member to show who's looking after
  it. It doesn't change who can complete it.
- **Undo** is organiser-only and takes the XP back from everyone, including any day or trip
  bonus the stop had triggered.
- Browsers only share location on `https://` pages or `localhost`, so testing on a phone
  needs a secure address (for example a tunnel), not a plain `http://192.168…` link.
- The coordinates come from the traveller's own device, so a determined person could fake
  them. This stops honest mistakes and shortcuts; it is not tamper-proof.

**Trip life cycle.** *Start trip* sits at the top of a planning trip. Only one trip can be live
per person at a time (starting another says which one is in the way). A trip becomes
**Completed** only when every stop on its itinerary is done; there is no manual "complete"
button. *Cancel trip* (Trip settings) calls it off and frees you to start another; *Reopen*
puts it back to planning. Budget is set in the create-trip wizard's "Who" step and can be
edited any time from the Overview tab or Trip settings; organisers can add and remove people
from the People tab.

**Following.** Follow travellers from their profile (`/u/username`) or from
*Feed → Find travellers to follow*. *Feed* and *Tracks* have a **Following** filter.

**India achievement map.** Your profile shows an India map where every state or union
territory you've finished a trip in is coloured in, with a completion percentage, a rank
(First Steps → Wanderer → Trailblazer → Pathfinder → Bharat Yatri → Sampoorna Yatri) and
a "Create share card" button that draws a 1080×1350 image for Instagram (Share opens the
phone's share sheet; on a laptop, save the image). A state counts from the trip's pin
(matched to the outline in the browser) or, without a pin, from its region name.
Outlines are simplified public data in `src/lib/indiaMapData.ts`; they are for colouring,
not a legal boundary. Others only see trips you've made public
(*Trip settings → Show on my public profile*, or in the wizard's More options).

**Your own destination.** In the create-trip wizard, *Set my own destination* lets you
click the map, name the place and size the trip area. On the trip's Map tab, *Drop a pin*
adds your own spot to the plan.

---

## Google Maps and Places

Destination search, discovery and the trip map use Google Maps Platform. Put a
**browser** key in `frontend/.env.local` (never in source code):

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-key
```

In Google Cloud Console, enable **Maps JavaScript API** and **Places API (New)**, then
restrict the key: *Application restrictions → Websites* (your site URL and
`http://localhost:3000/*` while developing) and *API restrictions* to just those two APIs.
A `NEXT_PUBLIC_` key is visible in the browser by design, so these restrictions are what
protect it.

How it fits together:

- **Create trip → Where:** search anywhere in India, or pick a state and browse popular
  places (Mountains, Beaches, Road trips, Temples…). Coordinates come from Google.
- **Create trip → What kind:** pick interests (Night Out, Temples, Trekking, Food…).
- **Create trip → Itinerary / trip → Map → Find places:** popular places for those
  interests. "Add to trip" saves each one as a normal itinerary activity.
- **Trip → Map:** All / Day 1 / Day 2 filters, numbered pins, a soft green circle for the
  main trip area, and a stop card to set a time, change the day or remove it.

Google is only called when someone searches. The picked place's name, address, rating and
coordinates are saved on the trip and its activities, so reopening a trip reads them from
our database. Trips created before this feature get their coordinates looked up once, the
first time an organiser opens the Map tab.

The green circle is an approximate area sized from Google's viewport — Google doesn't
provide administrative boundary outlines through these APIs, so it is not drawn as one.

---

## Design notes

**Simple outside, powerful inside.** A handful of top-level destinations (Home, My Trips,
Explore, Tracks, Feed, Rewards, Profile — on phones the bottom bar is Home, My Trips,
Explore, Feed and Rewards, with Profile as the avatar in the top bar) and five tabs inside a trip. Expenses, checklist, chat
and settings sit behind a "More" sheet. Every form shows the three or four fields
most people need and folds the rest under **More options**.

**Nine themes, light and dark.** Saffron Sunrise, Peacock Teal, Kerala Backwater,
Rajasthan Terracotta, Himalayan Dusk, Goa Beach, Jaipur Pink City, City Lights and
Jungle Trail — switchable from **Profile → Appearance**,
each with a light and a dark version plus an Auto mode that follows the OS.
Every colour is a semantic CSS custom property (`--brand`, `--canvas`, `--ink`…)
defined in `src/app/globals.css`, so components never hardcode a hex value. A tiny
script in `<head>` applies the saved theme before first paint, so there's no flash.

**Responsive, not shrunk.** Layouts change shape rather than scaling down: trip
cards go horizontal on laptops and stacked on phones; the People table becomes
cards below 768px; dialogs are centred on desktop and bottom sheets on mobile;
navigation is a top bar on laptops and a bottom bar on phones.

**Accessibility.** Labelled form controls, visible focus rings, ≥44×44px touch
targets, `aria-current` on navigation, focus trapping in sheets, a skip link, and
status never carried by colour alone — "✓ Completed", not just green. Drag-and-drop
has an explicit button alternative (move up / down / to another day) on every screen.

**Artwork.** Destination covers are inline SVG scenes — a fort, a beach with palms,
a shikhara, a mountain ridge, a winding road. They load instantly, never 404, cost
no bandwidth and work in both themes. Any trip or track can override its cover with
a real photo by setting `cover_image` to a URL.

---

## Photo storage (Google Cloud Storage)

Uploads (trip photos, reward pictures) go to the **`safarplan`** bucket when
`GS_BUCKET_NAME` is set, under `media/`; without it they're saved on the
server's disk (fine locally, wiped on each deploy on Railway/Render).

1. **Service account:** Google Cloud Console → IAM → Service accounts → create
   one, grant it **Storage Object Admin** on the `safarplan` bucket, and
   download a JSON key.
2. **Public read** (photos appear in the Feed): bucket → Permissions → Grant
   access → principal `allUsers`, role **Storage Object Viewer**. Keep
   "uniform bucket-level access" on. (Or set `GS_SIGNED_URLS=1` to keep the
   bucket private and use expiring signed links instead.)
3. **Backend env vars:**

   | Variable | Value |
   | --- | --- |
   | `GS_BUCKET_NAME` | `safarplan` |
   | `GS_CREDENTIALS_JSON` | the whole key file's JSON, on one line (hosted) |
   | `GOOGLE_APPLICATION_CREDENTIALS` | path to the key file (local dev, instead of the above) |
   | `GS_STATIC=0` | optional — keep admin CSS/JS on the app instead of the bucket's `static/` |

Run `python manage.py check_storage` to see where files are going; it does a
real upload to the bucket and names the fix if something's wrong (it also runs
on every Railway deploy — look for "Storage check" in the deploy logs). For
local development put the same variables in `backend/.env`.

Photos already on the server's disk aren't copied over automatically — upload
the `backend/media/` folder to `gs://safarplan/media/` once if you want them.

The first photo in a trip's gallery is that trip's picture everywhere — trip
cards, the trip page, Home, the Feed, invite links and published tracks.
Before anyone adds one, the cover picked while planning is used.

---

## API

All endpoints are under `/api/`, JWT-authenticated via `Authorization: Bearer <token>`.

| Endpoint | What it does |
| --- | --- |
| `POST /api/auth/google/`, `POST /api/auth/token/refresh/` | Sign in with Google (creates the account the first time), refresh the session |
| `GET/PATCH /api/auth/me/` | Profile, including saved theme and username (email is read-only) |
| `POST /api/auth/deactivate/`, `POST /api/auth/delete/` (`confirm`: your username) | Temporarily or permanently delete your account |
| `GET /api/home/` | Everything the Home screen needs, in one request |
| `GET/POST /api/trips/`, `GET/PATCH/DELETE /api/trips/{id}/` | Trips |
| `POST /api/trips/{id}/generate-plan/` | Fill a day (or all of them) with a suggested plan |
| `GET /api/trips/{id}/live/` | NOW / NEXT / TODAY / group, for Live Trip mode |
| `GET /api/trips/{id}/summary/` | The trip completion screen |
| `POST /api/trips/{id}/start/`, `/cancel/`, `/reopen/` | Trip status — `start` takes the organiser's `latitude`/`longitude` as the distance-XP start point |
| `POST /api/trips/{id}/finish/` | Organiser ends the trip early (after at least one stop); the rest are skipped and completion bonuses are paid pro rata |
| `POST /api/trips/{id}/leave/`, `DELETE /api/trips/{id}/members/{member_id}/` | Leave a trip (costs XP) / organiser removes someone |
| `GET/POST /api/trips/{id}/experience/`, `POST .../experience/skip/` | Your write-up of a finished trip, or "not now" |
| `GET/POST /api/trips/{id}/expenses/`, `/checklist/`, `/memories/`, `/chat/`, `/members/`, `/days/` | The advanced sections |
| `GET/POST /api/trips/{id}/settle/`, `POST .../settlements/{id}/confirm/` or `/decline/` | Settle up: suggested transfers with UPI links; record a payment; the receiver confirms it |
| `POST /api/trips/join/`, `GET /api/trips/invite/{code}/` | Join with an invite code / preview a trip before joining |
| `POST /api/trips/{id}/members/` (`user_id` or `username`) | Invite someone — they join once they accept |
| `GET /api/invites/`, `POST /api/invites/{id}/accept/` or `/decline/` | Trips I've been invited to, and answering them |
| `POST /api/activities/{id}/complete/`, `/undo/`, `/checkin/`, `/move/`, `/assign/` | Activity actions |
| `GET /api/explore/tracks/`, `POST .../{id}/like/`, `/save/`, `/use/` | Explore |
| `POST /api/explore/tracks/from-trip/` | Publish a finished trip as a track |
| `GET/POST /api/explore/posts/`, `POST .../{id}/like/`, `GET .../{id}/story/` | Feed posts; `story` is public and powers `/p/{id}` |
| `GET /api/music/search/` | Song search for trip soundtracks (iTunes Search API) |
| `GET /api/users/search/`, `/api/users/{username}/`, `.../follow/`, `/followers/`, `/following/`, `/travel-map/` | People, following and the India map |
| `GET /api/rewards/me/`, `/leaderboard/` | XP, achievements, levels and the XP rulebook |
| `GET/POST /api/rewards/catalog/`, `PATCH/DELETE .../{id}/`, `POST .../{id}/claim/` | Reward catalog: staff upload a reward image with the XP needed and how many people can claim it; travellers claim once (XP isn't spent) |
| `GET /api/rewards/admin/overview/`, `/admin/claims/`, `PATCH .../claims/{id}/` | Admin page: handle reward claims |
| `GET /api/notifications/`, `/unread-count/`, `POST /read-all/`, `/{id}/read/` | The notification bell |
| `/api/push/config/`, `/subscribe/`, `/unsubscribe/`, `/expo/register/`, `/expo/unregister/` | Web Push and Expo push sign-up |

Actions that earn XP return a common shape — the new user totals, `xp_awarded`,
`day_completed`, `trip_completed` and any `unlocked` achievements — so the UI knows
whether to show a small toast or a full celebration.

### XP rules

Defined in one place, `backend/rewards/services.py`:

| Action | XP |
| --- | --- |
| Plan a trip | +2 (organiser) |
| Complete a stop (everyone on the trip) | Distance XP for the leg travelled to reach it — start point → first stop, then stop → stop: 0.01 XP/km (1000 km = 10 XP, 2 km = 0.02 XP), at most 10 per leg. Tune with `DISTANCE_XP_PER_KM` / `DISTANCE_XP_LEG_CAP` |
| Finish every stop in a day (everyone) | +5 |
| Finish the trip (everyone) | +10, and +10 more for the organiser — or, if the organiser finishes early, that share of it (e.g. 1 of 3 stops done = 3.33) |
| Write about a finished trip (shared to the Feed) | +10 |
| Check in at a place | +1 |
| Add a memory | +1 |
| Publish a track | +10 |
| Unlock an achievement | 2–10 |
| **Leave a trip you joined** | **−2** before it starts, **−3** once it's live (XP already earned is kept) |
| **Cancel a trip that's already live** | **−10** (organiser); cancelling one still in planning is free |
| **Trip within 10 km of where it was planned / started** | Nothing — no XP earned or lost on it, and it doesn't count towards achievements |
| **Organiser undoes a stop** | Everyone loses that stop's distance XP — plus the day bonus if its day was complete, and the completion and organiser bonuses if the trip was finished |

**Settle up to unlock:** if you still owe money on a trip when it finishes, its completion XP (and the organiser bonus) is held until you've paid back what you owe and it's confirmed; stop and day XP isn't affected.

XP never drops below 0, and claiming a reward never spends it. Each rule in `XP_RULES` has a
`kind` — `earn`, `note` or `cut` — which groups it on the Rewards screen's *How XP works* sheet,
where the cuts are highlighted.

XP is kept to two decimal places, and no single reward is over 10 XP. A stop's XP is set by the server from the distance travelled; clients can't set it. Levels get
steeper: moving from level *L* to *L+1* costs `25 × L × (L+1)` XP — 50, 150, 300, 500… —
so level 3 takes about three trips and level 8 about 4,200 XP.

---

## Tests

```bash
cd backend
python manage.py test           # ~250 tests: XP rules, held XP, settle up, the 1 km rule, trip life cycle, leaving, invites, checklist, chat push, photos, experiences, soundtracks, the open feed, notifications, accounts
```

```bash
cd frontend
npm run build                   # type-checks the whole app
npx eslint src                  # lint
```

---

## Configuration

`frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

Backend environment variables (all optional in development):
`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.

### Putting it online (free tiers)

1. **Code on GitHub.** Create a repo and push this folder (`.env.local` and the database are
   git-ignored, so your key and local data stay private).
2. **Backend on Render.** *New → Blueprint*, pick the repo. It reads `render.yaml` and creates the
   API and a Postgres database. When it's up, note the API address (`https://safar-api.onrender.com`).
   Then create your own admin: in the Render *Shell* run `python manage.py createsuperuser`.
   (Optional demo data: `python manage.py seed`. Never use `--reset` on a live database.)
   **Or Railway:** point a service at `backend/`; `backend/start.sh` checks storage, runs
   `collectstatic` and migrations, creates the default superuser, seeds the achievements
   and starts gunicorn on every deploy.
3. **Frontend on Vercel.** *Add New → Project*, pick the repo, set **Root Directory = `frontend`**, and add:
   - `NEXT_PUBLIC_API_BASE` = your Render API address
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` = your (restricted) browser key
4. **Connect them.** In Render, set `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` to your
   Vercel address (e.g. `https://safar.vercel.app`). In Google Cloud, add that address under the
   key's website restrictions.

Free-tier limits: Render's free API sleeps after inactivity (the first request takes ~30 s), its
free database expires after 30 days, and uploaded photos live on a temporary disk. Fine for a demo;
upgrade the database and use object storage for real users.

### Before deploying

The development defaults are deliberately permissive. For anything public you'd
want to: set a real `DJANGO_SECRET_KEY`, run with `DJANGO_DEBUG=0`, move from
SQLite to PostgreSQL, serve uploaded photos from object storage rather than the
local `media/` directory, and narrow `CORS_ALLOWED_ORIGINS` to your real domain.
