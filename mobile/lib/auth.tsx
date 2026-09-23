import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, clearTokens, getTokens, setTokens } from "./api";
import type { User } from "./types";

interface AuthState {
  /** undefined while the stored session is still being checked, null once we know
   *  there isn't one. */
  user: User | undefined | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (fields: {
    username: string;
    password: string;
    email?: string;
    display_name?: string;
    home_city?: string;
    avatar_emoji?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | undefined | null>(undefined);

  async function loadUser() {
    try {
      const me = await api<User>("/api/auth/me/");
      setUser(me);
    } catch {
      // No valid session (or the refresh token expired too) — treat as signed out.
      await clearTokens();
      setUser(null);
    }
  }

  useEffect(() => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        setUser(null);
      }
    };

    (async () => {
      try {
        const tokens = await getTokens();
        if (!tokens) {
          settle();
          return;
        }
        await loadUser();
        settled = true;
      } catch {
        // SecureStore or the network failed in some way we didn't anticipate.
        // `user` must never be left at `undefined` forever — that's the app
        // stuck on its loading spinner with no way out — so always land on a
        // definite signed-out state and let the person log in again.
        settle();
      }
    })();

    // Belt and braces: a native call that hangs instead of rejecting
    // wouldn't be caught above. If nothing has settled `user` within a few
    // seconds, force a definite state rather than spin forever.
    const timeout = setTimeout(settle, 5000);
    return () => clearTimeout(timeout);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      async login(username, password) {
        const tokens = await api<{ access: string; refresh: string }>("/api/auth/token/", {
          method: "POST",
          body: { username, password },
          anonymous: true,
        });
        await setTokens(tokens);
        await loadUser();
      },
      async loginWithGoogle(idToken) {
        // Same endpoint the web app's Google button posts to — one account,
        // whichever way someone signs in with it.
        const data = await api<{ user: User; access: string; refresh: string }>("/api/auth/google/", {
          method: "POST",
          body: { credential: idToken },
          anonymous: true,
        });
        await setTokens({ access: data.access, refresh: data.refresh });
        setUser(data.user);
      },
      async register(fields) {
        const data = await api<{ user: User; access: string; refresh: string }>("/api/auth/register/", {
          method: "POST",
          body: fields,
          anonymous: true,
        });
        await setTokens({ access: data.access, refresh: data.refresh });
        setUser(data.user);
      },
      async logout() {
        await clearTokens();
        setUser(null);
      },
      refreshUser: loadUser,
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>.");
  return ctx;
}
