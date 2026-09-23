import type { ActivityCategory } from './types';

/** "12 Nov" or "12 Nov 2026" when the year isn't the current one. Mirrors
 *  frontend/src/lib/utils.ts's `shortDate` so trip dates read the same on both apps. */
export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  });
}

export function dateRange(start: string, end: string): string {
  return start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
}

export function rupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    amount || 0,
  );
}

/** "4:30 PM" from the API's "16:30:00". Mirrors frontend/src/lib/utils.ts's `clockTime`. */
export function clockTime(value: string | null): string {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes).padStart(2, '0')} ${period}`;
}

export const TRIP_TYPE_LABELS: Record<string, string> = {
  weekend: 'Weekend getaway',
  road: 'Road trip',
  family: 'Family trip',
  friends: 'Friends trip',
  couple: 'Couple trip',
  solo: 'Solo trip',
  college: 'College group',
  office: 'Office trip',
  pilgrimage: 'Pilgrimage',
  adventure: 'Adventure trip',
};

export const TRANSPORT_LABELS: Record<string, string> = {
  car: 'Car',
  bike: 'Bike',
  train: 'Train',
  flight: 'Flight',
  bus: 'Bus',
  mixed: 'Mixed',
};

export const TRANSPORT_ICONS: Record<string, string> = {
  car: '🚗',
  bike: '🏍️',
  train: '🚆',
  flight: '✈️',
  bus: '🚌',
  mixed: '🧭',
};

export const PACE_LABELS: Record<string, string> = {
  relaxed: 'Relaxed',
  balanced: 'Balanced',
  packed: 'Packed',
};

export function todayISO(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function statusBadge(status: string): { label: string; mark: string } {
  if (status === 'completed') return { label: 'Completed', mark: '✓' };
  if (status === 'active') return { label: 'Happening now', mark: '●' };
  if (status === 'cancelled') return { label: 'Cancelled', mark: '✕' };
  return { label: 'Planning', mark: '○' };
}

/** "Just now", "12m ago", "3h ago", "5d ago" — mirrors frontend/src/lib/utils.ts's
 *  `relativeTime`. Takes a full timestamp, unlike `shortDate`'s date-only input. */
export function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const CATEGORY_ICONS: Record<ActivityCategory, string> = {
  sightseeing: '🏛️',
  food: '🍛',
  travel: '🚗',
  stay: '🏨',
  adventure: '🪂',
  shopping: '🛍️',
  rest: '☕',
  event: '🎪',
  nature: '🌄',
};

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  sightseeing: 'Sightseeing',
  food: 'Food',
  travel: 'Travel',
  stay: 'Stay',
  adventure: 'Adventure',
  shopping: 'Shopping',
  rest: 'Rest',
  event: 'Event',
  nature: 'Nature',
};

export const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  active: 'Live now',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const COVER_EMOJI: Record<string, string> = {
  beach: '🏖️',
  mountain: '⛰️',
  snow: '🏔️',
  fort: '🏰',
  palace: '🕌',
  desert: '🏜️',
  backwater: '🛶',
  tea: '🍃',
  river: '🏞️',
  temple: '🛕',
  forest: '🌲',
  valley: '🌄',
  city: '🏙️',
  road: '🛣️',
};
