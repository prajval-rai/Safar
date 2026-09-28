import { cn } from "@/lib/utils";

/**
 * The Safar wordmark (mountains over a winding road). It's dark green on a
 * transparent background, so it sits on a light plate — that keeps it legible
 * in dark mode too, where the page behind it is near black.
 */
export function Logo({ className, plate = true }: { className?: string; plate?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/safar-logo.png"
      alt="Safar"
      width={640}
      height={448}
      className={cn("h-10 w-auto select-none", plate && "rounded-xl bg-white px-1.5 py-0.5", className)}
      draggable={false}
    />
  );
}
