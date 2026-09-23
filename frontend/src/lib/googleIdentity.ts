"use client";

/**
 * Loads Google's "Sign in with Google" script (Google Identity Services) once,
 * on demand — same on-demand-script pattern as loadMaps() in ./maps.ts, just
 * a different Google product with its own tiny script.
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface GoogleCredentialResponse {
  /** The ID token (a JWT) to hand to our backend for verification. */
  credential: string;
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleButtonOptions {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill";
  width?: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfig) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
        };
      };
    };
  }
}

let loadPromise: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error("no-client-id"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("load-failed"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
