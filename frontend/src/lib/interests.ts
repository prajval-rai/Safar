import {
  Bike,
  Camera,
  Castle,
  Coffee,
  Landmark,
  Moon,
  Mountain,
  ShoppingBag,
  Tent,
  Trees,
  Umbrella,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { ActivityCategory } from "./types";

export interface Interest {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** The Google Places text-search phrase for this interest. */
  query: (place: string) => string;
  /** How a place found through this interest is filed in the itinerary. */
  activityCategory: ActivityCategory;
}

export const INTERESTS: Interest[] = [
  { id: "night", label: "Night Out", Icon: Moon, query: (p) => `nightlife, bars and clubs in ${p}`, activityCategory: "event" },
  { id: "temples", label: "Temples", Icon: Landmark, query: (p) => `famous temples in ${p}`, activityCategory: "sightseeing" },
  { id: "trekking", label: "Trekking", Icon: Mountain, query: (p) => `trekking and hiking trails near ${p}`, activityCategory: "adventure" },
  { id: "road", label: "Road Ride", Icon: Bike, query: (p) => `scenic drives and viewpoints near ${p}`, activityCategory: "travel" },
  { id: "beaches", label: "Beaches", Icon: Umbrella, query: (p) => `beaches near ${p}`, activityCategory: "nature" },
  { id: "historical", label: "Historical Places", Icon: Castle, query: (p) => `historical places, forts and monuments in ${p}`, activityCategory: "sightseeing" },
  { id: "food", label: "Food", Icon: Utensils, query: (p) => `famous local food in ${p}`, activityCategory: "food" },
  { id: "adventure", label: "Adventure", Icon: Zap, query: (p) => `adventure activities in ${p}`, activityCategory: "adventure" },
  { id: "nature", label: "Nature", Icon: Trees, query: (p) => `nature spots, lakes and parks near ${p}`, activityCategory: "nature" },
  { id: "shopping", label: "Shopping", Icon: ShoppingBag, query: (p) => `popular markets and shopping in ${p}`, activityCategory: "shopping" },
  { id: "cafes", label: "Cafes", Icon: Coffee, query: (p) => `best cafes in ${p}`, activityCategory: "food" },
  { id: "photography", label: "Photography", Icon: Camera, query: (p) => `best photography spots and viewpoints in ${p}`, activityCategory: "sightseeing" },
];

export function interestById(id: string): Interest | undefined {
  return INTERESTS.find((interest) => interest.id === id);
}

/** Sensible starting interests for each kind of trip — always editable. */
export const TYPE_INTERESTS: Record<string, string[]> = {
  friends: ["food", "cafes", "night"],
  family: ["nature", "food", "historical"],
  couple: ["cafes", "nature", "photography"],
  solo: ["photography", "cafes", "historical"],
  weekend: ["food", "nature"],
  road: ["road", "nature", "food"],
  college: ["adventure", "food", "night"],
  office: ["food", "cafes"],
  adventure: ["trekking", "adventure"],
  pilgrimage: ["temples", "historical"],
};

/** "What kind of place are you after?" when browsing destinations in a state. */
export interface DestinationTheme {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Phrase inserted into "…in {state}, India". Empty means the general list. */
  term: string;
}

export const DESTINATION_THEMES: DestinationTheme[] = [
  { id: "all", label: "Popular", Icon: Zap, term: "best places to visit" },
  { id: "mountain", label: "Mountains", Icon: Mountain, term: "best hill stations to visit" },
  { id: "beach", label: "Beaches", Icon: Umbrella, term: "best beaches to visit" },
  { id: "road", label: "Road trips", Icon: Bike, term: "best scenic drives and road trips" },
  { id: "temple", label: "Temples", Icon: Landmark, term: "most famous temples" },
  { id: "heritage", label: "Forts & heritage", Icon: Castle, term: "best forts and palaces" },
  { id: "nature", label: "Nature", Icon: Trees, term: "best national parks and nature places" },
  { id: "adventure", label: "Adventure", Icon: Tent, term: "best trekking and adventure places" },
];
