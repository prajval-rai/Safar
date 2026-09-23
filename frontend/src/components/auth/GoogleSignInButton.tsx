"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, loginWithGoogle } from "@/lib/api";
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from "@/lib/googleIdentity";
import type { User } from "@/lib/types";

/**
 * Google's own rendered button — Google, not us, draws it, so it always
 * matches whatever "Sign in with Google" is supposed to look like. Renders
 * nothing at all when NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't set, so local dev
 * without it configured just quietly has one less option, not a broken one.
 */
export function GoogleSignInButton({
  onSignedIn,
  onError,
}: {
  onSignedIn: (user: User) => void;
  onError: (message: string) => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // Always-current handlers for the callback below, without making the
  // init effect re-run (and the button re-render) on every keystroke in the
  // surrounding form. Written from an effect, not render, per the rules of
  // refs — this one just has no dependency array, so it runs after every render.
  const handlers = useRef({ onSignedIn, onError });
  useEffect(() => {
    handlers.current = { onSignedIn, onError };
  });

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let active = true;

    loadGoogleIdentity()
      .then(() => {
        if (!active || !buttonRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            try {
              handlers.current.onSignedIn(await loginWithGoogle(response.credential));
            } catch (err) {
              handlers.current.onError(
                err instanceof ApiError ? err.message : "Couldn't sign in with Google.",
              );
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 320,
        });
        setReady(true);
      })
      .catch(() => {
        // No network, blocked script, etc. — the rest of the form (username
        // + password) still works, so this fails silently rather than
        // showing an error for a button nobody tried to use yet.
      });

    return () => {
      active = false;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-xs font-semibold text-muted" role="separator">
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        or
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
      <div className="mt-4 flex justify-center">
        {!ready ? <div className="h-11 w-full max-w-[320px] animate-pulse rounded-full bg-raised" /> : null}
        <div ref={buttonRef} className={ready ? "" : "hidden"} />
      </div>
    </div>
  );
}
