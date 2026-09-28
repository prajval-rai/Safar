import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A reward's picture, shown whole: the image sits contained in the frame over
 * a blurred, enlarged copy of itself, so any shape of upload — a tall product
 * shot, a wide banner, a square icon — fills the card without being cropped
 * or stretched. `children` are overlays (price tag, status badges).
 */
export function RewardImage({
  src,
  className,
  children,
}: {
  src: string | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative aspect-[16/10] w-full overflow-hidden bg-raised", className)}>
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            className="relative h-full w-full object-contain p-3 drop-shadow-xl transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-soft to-raised text-6xl"
          aria-hidden="true"
        >
          🎁
        </div>
      )}
      {/* A soft fade at the bottom so overlaid labels always read. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
      {children}
    </div>
  );
}
