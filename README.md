# Safar — a travel companion for Indian trips

Plan a trip with your people, follow the plan while you're actually travelling,
split what you spend, and earn XP along the way.

Two pieces:

- `backend/` — Django 5 + Django REST Framework, JWT auth, SQLite
- `frontend/` — Next.js 16 (App Router) + React 19 + Tailwind CSS 4, TypeScript

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

### Demo logins

| Username   | Password    | What they show                                |
| ---------- | ----------- | --------------------------------------------- |
| `prajwal`  | `safar1234` | A live trip, an upcoming one, a finished one  |
| `rahul`    | `safar1234` | A fellow traveller on the same trips          |
| `admin`    | `safar1234` | Django admin at <http://localhost:8000/admin> |

The seeded **Jaipur Weekend** is happening *today*, so Live Trip mode has real
data in it straight away.

---

## What's in it

**Planning**
- Six-step create-trip wizard (where → when → who → what kind → itinerary → invite)
- Smart defaults: picking "Weekend getaway" suggests 2 days; "Road trip" suggests a car
- "Generate day plan" fills a day from a destination template you can then edit
- Day-by-day itinerary, activities with times, costs, XP and locations
- Invite by username or by a 6-character code

**While travelling**
- **Live Trip mode** — a stripped-back screen showing only NOW, NEXT, TODAY and who's with you
- Check in, mark done, and navigate (deep-links into Google Maps)
- Map tab: Google map with numbered stops and All / Day 1 / Day 2 filters (see below)

**After**
- Trip completion screen with the route, the numbers and your crew
- Home asks "How was <trip>?" with the XP you earned on it, and everyone's write-ups
  show on the trip story
- Publish the trip as a **track** others can copy into their own trips
- Write a travel post

**Along the way**
- XP for activities, days, trips, check-ins and photos; ten achievements; levels
- Expenses with an equal split and who-owes-what
- Checklist, group chat, photo memories

---

## Completing stops, assignment and the travel map

**Organisers complete stops for the group.** Only the trip owner or a co-planner can mark
a stop complete, and it's then done for everyone on the trip: every member earns its XP
(and the day and trip bonuses when those finish). Travellers can still check in themselves.

**The 1 km rule.** A stop with a pin on the map can only be checked in at, or marked
complete, from within 1 km of it — there is no override and it isn't configurable. The app
asks for the device's location and the server does the distance check
(`backend/trips/geo.py`); a stop with no pin has nothing to measure and just completes.

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

**Simple outside, powerful inside.** Five top-level destinations (Home, My Trips,
Explore, Rewards, Profile) and five tabs inside a trip. Expenses, checklist, chat
and settings sit behind a "More" sheet. Every form shows the three or four fields
most people need and folds the rest under **More options**.

**Five themes, light and dark.** Saffron Sunrise, Peacock Teal, Kerala Backwater,
Rajasthan Terracotta and Himalayan Dusk — switchable from **Profile → Appearance**,
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

## API

All endpoints are under `/api/`, JWT-authenticated via `Authorization: Bearer <token>`.

| Endpoint | What it does |
| --- | --- |
| `POST /api/auth/register/`, `POST /api/auth/token/` | Sign up, log in |
| `GET/PATCH /api/auth/me/` | Profile, including saved theme |
| `GET /api/home/` | Everything the Home screen needs, in one request |
| `GET/POST /api/trips/`, `GET/PATCH/DELETE /api/trips/{id}/` | Trips |
| `POST /api/trips/{id}/generate-plan/` | Fill a day (or all of them) with a suggested plan |
| `GET /api/trips/{id}/live/` | NOW / NEXT / TODAY / group, for Live Trip mode |
| `GET /api/trips/{id}/summary/` | The trip completion screen |
| `POST /api/trips/{id}/start/`, `/cancel/`, `/reopen/` | Trip status |
| `GET/POST /api/trips/{id}/experience/` | Your write-up of a finished trip |
| `GET/POST /api/trips/{id}/expenses/`, `/checklist/`, `/memories/`, `/chat/`, `/members/` | The advanced sections |
| `POST /api/trips/join/` | Join with an invite code |
| `POST /api/activities/{id}/complete/`, `/undo/`, `/checkin/`, `/move/` | Activity actions |
| `GET /api/explore/tracks/`, `POST .../{id}/like/`, `/save/`, `/use/` | Explore |
| `POST /api/explore/tracks/from-trip/` | Publish a finished trip as a track |
| `GET /api/rewards/me/`, `/leaderboard/` | XP, achievements, levels |

Actions that earn XP return a common shape — the new user totals, `xp_awarded`,
`day_completed`, `trip_completed` and any `unlocked` achievements — so the UI knows
whether to show a small toast or a full celebration.

### XP rules

Defined in one place, `backend/rewards/services.py`:

| Action | XP |
| --- | --- |
| Plan a trip | +2 (organiser) |
| Complete a stop (everyone on the trip) | 1–5 by category: adventure 5, sightseeing/nature 4, event/travel 3, food/shopping 2, stay/rest 1 |
| Finish every stop in a day (everyone) | +5 |
| Finish the trip (everyone) | +10, and +10 more for the organiser |
| Write about a finished trip (shared to the Feed) | +10 |
| Check in at a place | +1 |
| Add a memory | +1 |
| Publish a track | +10 |
| Unlock an achievement | 2–10 |
| Leave a trip you joined | −2 before it starts, −3 once it's live |
| Cancel a trip that's already live | −10 (organiser) |

**Settle up to unlock:** if you still owe money on a trip when it finishes, its completion XP (and the organiser bonus) is held until you've paid back what you owe and it's confirmed; stop and day XP isn't affected.

Every reward is between 1 and 10 XP. A stop's XP is set by the server from its category; clients can't set it. Levels get
steeper: moving from level *L* to *L+1* costs `25 × L × (L+1)` XP — 50, 150, 300, 500… —
so level 3 takes about three trips and level 8 about 4,200 XP.

---

## Tests

```bash
cd backend
python manage.py test           # 87 tests: XP rules, Google-picked places, the 1 km rule, assignment, following, travel map, permissions, itinerary, tracks, expenses
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
