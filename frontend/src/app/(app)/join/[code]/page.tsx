"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { ErrorNote, LoadingBlock } from "@/components/ui/Bits";
import { ApiError, api } from "@/lib/api";
import type { TripDetail } from "@/lib/types";

/** Where an invitation card's link and QR code point: joins the trip and
 *  opens it. Signed-out visitors go through login first and come back here. */
export default function JoinByLinkPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { toast } = useCelebration();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post<TripDetail>("/api/trips/join/", { code: decodeURIComponent(code).trim().toUpperCase() })
      .then((trip) => {
        toast(`You're in — ${trip.title}`);
        router.replace(`/trips/${trip.id}`);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't join that trip."));
  }, [code, router, toast]);

  if (error) return <ErrorNote message={error} onRetry={() => router.replace("/")} />;
  return <LoadingBlock label="Joining the trip…" />;
}
