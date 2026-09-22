"use client";

import { MapPin, Star } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A place's photo with a rating badge. The photo comes straight from Google for
 * this view only (its URL carries our key, so it is never saved in our database).
 * With no photo, or if it fails to load, a soft placeholder keeps the card tidy.
 */
export function PlacePhoto({
  src,
  alt,
  rating,
  className,
}: {
  src?: string | null;
  alt: string;
  rating?: number | null;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <div className={cn("group relative overflow-hidden bg-brand-soft", className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- Google-hosted photo with a keyed URL
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onError={() => setFailedSrc(src ?? null)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-soft to-raised text-brand/60"
          aria-hidden="true"
        >
          <MapPin size={34} strokeWidth={1.5} />
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent"
        aria-hidden="true"
      />
      {rating ? (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-bold text-stone-900 shadow">
          <Star size={12} className="fill-amber-500 text-amber-500" aria-hidden="true" />
          {rating.toFixed(1)}
          <span className="sr-only-text"> rating out of 5</span>
        </span>
      ) : null}
    </div>
  );
}
