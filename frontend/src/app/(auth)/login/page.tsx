"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { JaliPattern } from "@/components/art/Motif";
import { Logo } from "@/components/brand/Logo";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useAuth } from "@/components/providers/AuthProvider";
import { GOOGLE_CLIENT_ID } from "@/lib/googleIdentity";
import { rememberReferralFromUrl } from "@/lib/referral";
import { returnPath } from "@/lib/returnPath";

const noSubscription = () => () => {};

/** Safar signs everyone in with Google — one button for new and returning
 *  travellers alike; the backend creates the account the first time. */
export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Came in on a friend's referral link? Keep the code for the sign-in. Read
  // in the browser only — the server render never knows about it.
  const referred = useSyncExternalStore(
    noSubscription,
    () => Boolean(rememberReferralFromUrl()),
    () => false,
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* The decorative half only appears when there's room for it. */}
      <aside className="relative hidden overflow-hidden bg-brand lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="absolute inset-0 text-white/10" aria-hidden="true">
          <JaliPattern />
        </div>
        <div className="relative flex max-w-lg flex-col items-center text-center text-on-brand">
          <Logo className="h-56 rounded-3xl px-6 py-4 shadow-xl" />
          <h1 className="sr-only-text">Safar</h1>
          <p className="mt-4 text-2xl opacity-90">
            Plan the trip, follow the plan, and keep the memories — all in one place.
          </p>
        </div>
      </aside>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <Logo className="h-24" />
            <h1 className="sr-only-text">Safar</h1>
          </div>

          <h2 className="text-2xl font-bold text-ink">Ready for the journey?</h2>
          <p className="mt-1 text-sm text-muted">
            Continue with Google — new here or coming back, it&apos;s the same one tap.
          </p>

          {referred ? (
            <p className="mt-4 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-brand">
              <span aria-hidden="true">🤝 </span>A friend invited you to Safar. Join now and they earn XP for bringing you
              along.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          {GOOGLE_CLIENT_ID ? (
            <GoogleSignInButton
              onSignedIn={(signedInUser) => {
                setUser(signedInUser);
                router.replace(returnPath());
              }}
              onError={(message) => setError(message)}
            />
          ) : (
            <p className="mt-6 rounded-xl border border-line bg-raised p-3.5 text-sm text-muted">
              Google sign-in isn&apos;t configured. Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to enable it.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
