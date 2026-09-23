export type ThemeId =
  | "saffron"
  | "peacock"
  | "backwater"
  | "terracotta"
  | "himalaya"
  | "beach"
  | "pinkcity"
  | "metro"
  | "forest";
export type ColorMode = "light" | "dark" | "system";

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

export interface UserMini {
  id: number;
  username: string;
  name: string;
  avatar_emoji: string;
  xp: number;
  level: number;
  level_name: string;
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
  theme: ThemeId;
  color_mode: ColorMode;
  date_joined: string;
  /** Whether a recovery question is set — never the question code or answer. */
  has_security_question: boolean;
  security_question_label: string;
}

export type ActivityStatus = "planned" | "completed" | "skipped";

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
  google_place_id: string;
  place_address: string;
  place_rating: number | null;
  start_time: string | null;
  end_time: string | null;
  description: string;
  notes: string;
  cost: number;
  xp_value: number;
  requires_photo: boolean;
  requires_checkin: boolean;
  booking_url: string;
  order: number;
  status: ActivityStatus;
  completed_at: string | null;
  completed_by: UserMini | null;
  checked_in_at: string | null;
  assigned_to: UserMini | null;
  /** True when the completer's phone was within 1 km of the place. */
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

export type TripStatus = "planning" | "active" | "completed" | "cancelled";

export interface Trip {
  id: string;
  title: string;
  destination: string;
  region: string;
  summary: string;
  cover_key: CoverKey;
  cover_image: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string;
  area_radius_km: number;
  interests: string[];
  start_date: string;
  end_date: string;
  trip_type: string;
  pace: "relaxed" | "balanced" | "packed";
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
  /** Palette drawn from the destination's state — the same for every member,
   *  regardless of anyone's own personal theme. See useTripTheme(). */
  theme: ThemeId;
}

export interface TripDetail extends Trip {
  join_code: string;
  days: Day[];
  members: TripMember[];
  planned_xp: number;
  my_role: "owner" | "admin" | "member" | null;
  created_at: string;
}

export interface LiveTrip {
  trip: Trip;
  day: Day | null;
  now: Activity | null;
  next: Activity | null;
  completed_today: number;
  total_today: number;
  members: TripMember[];
  my_trip_xp: number;
}

export interface TripSummary {
  trip: Trip;
  days: number;
  locations: number;
  activities_completed: number;
  activities_total: number;
  xp: number;
  total_spend: number;
  spend_per_person: number;
  route: string[];
  leaderboard: { user: UserMini; xp: number; progress: number }[];
  memories: Memory[];
}

export interface Memory {
  id: string;
  trip: string;
  activity: string | null;
  user: UserMini;
  image: string | null;
  image_url: string;
  caption: string;
  created_at: string;
}

export interface Expense {
  id: string;
  trip: string;
  title: string;
  amount: number;
  category: string;
  paid_by: UserMini;
  split_type: "equal" | "payer";
  note: string;
  spent_on: string;
  created_at: string;
}

export interface ExpenseReport {
  results: Expense[];
  total: number;
  per_person_share: number;
  balances: { user: UserMini; paid: number; share: number; balance: number }[];
}

export interface ChecklistItem {
  id: number;
  trip: string;
  title: string;
  category: string;
  assigned_to: UserMini | null;
  is_done: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  trip: string;
  user: UserMini;
  text: string;
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

export interface Track {
  id: string;
  title: string;
  summary: string;
  destination: string;
  region: string;
  cover_key: CoverKey;
  cover_image: string;
  days: number;
  trip_type: string;
  difficulty: "easy" | "moderate" | "tough";
  best_season: string;
  estimated_cost: number;
  route: string[];
  tags: string[];
  author: UserMini;
  likes_count: number;
  saves_count: number;
  stop_count: number;
  liked: boolean;
  saved: boolean;
  created_at: string;
}

export interface TrackDetail extends Track {
  track_days: TrackDay[];
  total_xp: number;
}

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

export interface AchievementRow {
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

/** One entry in the "How XP works" rulebook — what earns it, or costs it. */
export interface XPRule {
  icon: string;
  title: string;
  detail: string;
}

export interface RewardsPayload {
  user: User;
  achievements: AchievementRow[];
  unlocked_count: number;
  total_count: number;
  recent: XPTransaction[];
  xp_rules: XPRule[];
}

export interface HomePayload {
  user: User;
  live_trip: Trip | null;
  upcoming: Trip[];
  past: Trip[];
  counts: { trips: number; completed: number; places: number };
}

/** Everything an XP-earning action sends back, so the UI can celebrate correctly. */
export interface XPResult {
  user: User;
  xp_awarded?: number;
  day_completed?: boolean;
  day_index?: number;
  trip_completed?: boolean;
  unlocked?: { title: string; icon: string }[];
  activity?: Activity;
}

export interface Destination {
  name: string;
  region: string;
  cover_key: CoverKey;
  tagline: string;
  ideal_days: number;
  transport: string;
}

export interface TripTypeDefault {
  days: number;
  pace: "relaxed" | "balanced" | "packed";
  transport: string;
  hint: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type NotificationKind =
  | "trip_member_added"
  | "trip_joined"
  | "trip_started"
  | "track_used"
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

/** A place chosen through Google, in the shape we store on trips and activities. */
export interface PickedPlace {
  place_id: string;
  name: string;
  address: string;
  region: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  rating_count: number | null;
  types: string[];
  /** Rough radius of the place's own area, from Google's viewport. */
  radius_km: number;
  /** For display only — the URL carries our key, so it is never saved. */
  photo_url?: string | null;
}

/** One option in the fixed catalog for account-recovery questions. */
export interface SecurityQuestion {
  value: string;
  label: string;
}

/** Someone in a followers / following list, or a search result. */
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
  achievements: {
    code: string;
    title: string;
    icon: string;
    description: string;
    unlocked_at: string;
  }[];
}

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
