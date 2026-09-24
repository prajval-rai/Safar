/**
 * Mirrors the shapes the Django API actually returns (see `backend/accounts/serializers.py`
 * and `backend/trips/views.py`). Kept as a separate, hand-copied file rather than a shared
 * package with `frontend/` — the two apps ship independently, and this is the subset the
 * mobile screens in this first pass actually use.
 */

export interface UserMini {
  id: number;
  username: string;
  name: string;
  avatar_emoji: string;
  xp: number;
  level: number;
}

export interface User extends UserMini {
  email: string;
  display_name: string;
  home_city: string;
  bio: string;
  phone: string;
  level_name: string;
  xp_into_level: number;
  xp_for_next_level: number;
  level_progress: number;
  date_joined: string;
}

export type TripStatus = "planning" | "active" | "completed" | "cancelled";

export type CoverKey =
  | "beach"
  | "mountain"
  | "snow"
  | "fort"
  | "palace"
  | "desert"
  | "backwater"
  | "tea"
  | "river"
  | "temple"
  | "forest"
  | "valley"
  | "city"
  | "road";

export interface Trip {
  id: string;
  title: string;
  destination: string;
  region: string;
  summary: string;
  cover_key: CoverKey;
  cover_image: string;
  start_date: string;
  end_date: string;
  trip_type: string;
  pace: string;
  transport: string;
  budget_per_person: number;
  status: TripStatus;
  is_public: boolean;
  created_by: UserMini;
  duration_days: number;
  progress_percent: number;
  total_xp: number;
  member_count: number;
  activity_count: number;
}

export type ActivityStatus = "planned" | "completed" | "skipped";

export interface Activity {
  id: string;
  day: number;
  day_index: number;
  trip: string;
  title: string;
  category: ActivityCategory;
  place_name: string;
  latitude: number | null;
  longitude: number | null;
  place_address: string;
  start_time: string | null;
  end_time: string | null;
  description: string;
  notes: string;
  cost: number;
  xp_value: number;
  order: number;
  status: ActivityStatus;
  completed_at: string | null;
  completed_by: UserMini | null;
  checked_in_at: string | null;
  assigned_to: UserMini | null;
  verified_by_location: boolean;
  memory_count: number;
}

export interface Day {
  id: number;
  trip: string;
  index: number;
  date: string;
  title: string;
  notes: string;
  progress_percent: number;
  is_complete: boolean;
  activities: Activity[];
}

export interface TripMember {
  id: number;
  user: UserMini;
  role: "owner" | "admin" | "member";
  joined_at: string;
  xp_earned: number;
  progress_percent: number;
}

export interface TripDetail extends Trip {
  join_code: string;
  days: Day[];
  members: TripMember[];
  planned_xp: number;
  my_role: "owner" | "admin" | "member" | null;
  /** XP leaving would cost you right now (negative), or null if you can't leave. */
  leave_penalty: number | null;
  created_at: string;
}

export interface XPResult {
  user: User;
  xp_awarded?: number;
  day_completed?: boolean;
  day_index?: number;
  trip_completed?: boolean;
  unlocked?: { title: string; icon: string }[];
  activity?: Activity;
}

export interface HomeData {
  user: User;
  live_trip: Trip | null;
  upcoming: Trip[];
  past: Trip[];
  /** The latest finished trip you haven't written about yet. */
  experience_prompt: { trip: Trip; xp_earned: number } | null;
  counts: { trips: number; completed: number; places: number };
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Track {
  id: string;
  title: string;
  destination: string;
  region: string;
  summary: string;
  cover_key: CoverKey;
  cover_image: string;
  days: number;
  difficulty: string;
  estimated_cost: number;
  best_season: string;
  route: string[];
  tags: string[];
  trip_type: string;
  stop_count: number;
  likes_count: number;
  saves_count: number;
  liked: boolean;
  saved: boolean;
  author: UserMini;
  created_at: string;
}

export interface TrackStop {
  id: number;
  title: string;
  category: ActivityCategory;
  place_name: string;
  latitude: number | null;
  longitude: number | null;
  start_time: string | null;
  description: string;
  cost: number;
  xp_value: number;
  order: number;
}

export interface TrackDay {
  id: number;
  index: number;
  title: string;
  stops: TrackStop[];
}

export interface TrackDetail extends Track {
  track_days: TrackDay[];
  total_xp: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  goal_value: number;
  current: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

export interface XPTransaction {
  id: number;
  amount: number;
  kind: string;
  reason: string;
  trip: string | null;
  trip_title: string;
  created_at: string;
}

export interface RewardsMe {
  user: User;
  achievements: Achievement[];
  unlocked_count: number;
  total_count: number;
  recent: XPTransaction[];
}

export type LeaderboardRow = UserMini & { rank: number; is_me: boolean };

export type ActivityCategory =
  | "sightseeing"
  | "food"
  | "travel"
  | "stay"
  | "adventure"
  | "shopping"
  | "rest"
  | "event"
  | "nature";

export interface TravelMapData {
  areas: {
    trip_id: string;
    title: string;
    destination: string;
    region: string;
    latitude: number;
    longitude: number;
    radius_km: number;
    cover_key: CoverKey;
    end_date: string;
  }[];
  places: {
    id: string;
    title: string;
    place_name: string;
    category: ActivityCategory;
    latitude: number;
    longitude: number;
    trip_title: string;
    completed_at: string;
  }[];
  finished: { trip_id: string; title: string; destination: string; region: string; end_date: string }[];
  needs_coords: { trip_id: string; destination: string; region: string }[];
  areas_covered: number;
}

export type NotificationKind =
  | "trip_member_added"
  | "trip_joined"
  | "trip_left"
  | "trip_started"
  | "trip_reminder"
  | "activity_reminder"
  | "trip_cancelled"
  | "trip_completed"
  | "settle_paid"
  | "settle_confirmed"
  | "xp_released"
  | "track_used"
  | "track_published"
  | "new_follower"
  | "achievement_unlocked";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  actor: UserMini | null;
  trip_id: string | null;
  trip_title: string;
  track_id: string | null;
  track_title: string;
  read: boolean;
  created_at: string;
}

export type NotificationPage = Paginated<Notification> & { unread_count: number };

export interface TravelPost {
  id: string;
  author: UserMini;
  trip: string | null;
  trip_title: string;
  can_open_trip: boolean;
  track: string | null;
  caption: string;
  place: string;
  cover_key: CoverKey;
  image_url: string;
  likes_count: number;
  liked: boolean;
  created_at: string;
}

export interface Person extends UserMini {
  is_following: boolean;
  is_me: boolean;
}

export interface PublicUser extends UserMini {
  bio: string;
  home_city: string;
  level_name: string;
  xp_into_level: number;
  xp_for_next_level: number;
  level_progress: number;
  date_joined: string;
}

export interface PublicProfile {
  user: PublicUser;
  followers_count: number;
  following_count: number;
  is_me: boolean;
  is_following: boolean;
  stats: { trips_completed: number; places_verified: number; tracks: number };
  achievements: { code: string; title: string; icon: string; description: string; unlocked_at: string }[];
}
