import type { Activity, ActivityCategory, CoverKey, TripStatus } from "./types";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** ₹12,500 with Indian digit grouping. */
export function rupees(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value || 0);
}

/** "12 Nov" or "12 Nov 2026" when the year isn't the current one. */
export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-IN", { weekday: "long" });
}

export function dateRange(start: string, end: string): string {
  return start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
}

/** "4:30 PM" from the API's "16:30:00". */
export function clockTime(value: string | null): string {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function timeWindow(activity: Pick<Activity, "start_time" | "end_time">): string {
  if (!activity.start_time) return "Any time";
  const start = clockTime(activity.start_time);
  return activity.end_time ? `${start} – ${clockTime(activity.end_time)}` : start;
}

/** "In 12 days", "Today", "3 days ago" — friendlier than a bare date. */
export function relativeDays(iso: string): string {
  const target = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** "Just now", "12m ago", "3h ago", "5d ago" — for a full timestamp, e.g. a
 *  notification, rather than `relativeDays`'s date-only granularity. */
export function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const CATEGORY_ICONS: Record<ActivityCategory, string> = {
  sightseeing: "🏛️",
  food: "🍛",
  travel: "🚗",
  stay: "🏨",
  adventure: "🪂",
  shopping: "🛍️",
  rest: "☕",
  event: "🎪",
  nature: "🌄",
};

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  sightseeing: "Sightseeing",
  food: "Food",
  travel: "Travel",
  stay: "Stay",
  adventure: "Adventure",
  shopping: "Shopping",
  rest: "Rest",
  event: "Event",
  nature: "Nature",
};

export const TRIP_TYPE_LABELS: Record<string, string> = {
  weekend: "Weekend getaway",
  road: "Road trip",
  family: "Family trip",
  friends: "Friends trip",
  couple: "Couple trip",
  solo: "Solo trip",
  college: "College group",
  office: "Office trip",
  pilgrimage: "Pilgrimage",
  adventure: "Adventure trip",
};

export const TRANSPORT_LABELS: Record<string, string> = {
  car: "Car",
  bike: "Bike",
  train: "Train",
  flight: "Flight",
  bus: "Bus",
  mixed: "Mixed",
};

export const TRANSPORT_ICONS: Record<string, string> = {
  car: "🚗",
  bike: "🏍️",
  train: "🚆",
  flight: "✈️",
  bus: "🚌",
  mixed: "🧭",
};

export const PACE_LABELS: Record<string, string> = {
  relaxed: "Relaxed",
  balanced: "Balanced",
  packed: "Packed",
};

/** Status never relies on colour alone — it always carries a word and a mark. */
export function statusBadge(status: TripStatus): { label: string; mark: string } {
  if (status === "completed") return { label: "Completed", mark: "✓" };
  if (status === "active") return { label: "Happening now", mark: "●" };
  if (status === "cancelled") return { label: "Cancelled", mark: "✕" };
  return { label: "Planning", mark: "○" };
}

export const COVER_LABELS: Record<CoverKey, string> = {
  beach: "Beach",
  mountain: "Mountains",
  snow: "Snow",
  fort: "Fort",
  palace: "Palace",
  desert: "Desert",
  backwater: "Backwaters",
  tea: "Tea estates",
  river: "River",
  temple: "Temple town",
  forest: "Forest",
  valley: "Valley",
  city: "City",
  road: "Road trip",
};

/** Opens turn-by-turn navigation in whatever maps app the phone has. */
export function mapsLink(activity: Pick<Activity, "latitude" | "longitude" | "place_name">): string {
  if (activity.latitude != null && activity.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    activity.place_name || "",
  )}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Adds `days` to an ISO date and returns another ISO date. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}
