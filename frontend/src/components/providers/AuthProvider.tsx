"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearReturnPath, rememberReturnPath, returnPath } from "@/lib/returnPath";

import { api, tokens } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Replace the cached user after an XP change, profile edit, etc. */
  setUser: (user: User) => void;
  refresh: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password"];
// Open to everyone, signed in or not — e.g. an invite link someone opens
// before they have an account.
const OPEN_ROUTE_PREFIXES = ["/join/"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isOpen = OPEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  const fetchMe = useCallback(
    () =>
      tokens.access()
        ? api.get<User>("/api/auth/me/").catch(() => {
            tokens.clear();
            return null;
          })
        : Promise.resolve(null),
    [],
  );

  // State is only ever set from the promise callback, never synchronously
  // while the effect body runs.
  useEffect(() => {
    let active = true;
    void fetchMe().then((fetched) => {
      if (!active) return;
      setUser(fetched);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [fetchMe]);

  const refresh = useCallback(async () => {
    setUser(await fetchMe());
  }, [fetchMe]);

  // Send signed-out travellers to the login screen, but never trap them there.
  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic && !isOpen) {
      // An invite link (or any deep link) opened while signed out should
      // land back there once they've signed in, not on Home.
      if (pathname !== "/") rememberReturnPath(pathname);
      router.replace("/login");
    }
    if (user && isPublic) router.replace(returnPath());
    if (user && !isPublic && pathname === returnPath()) clearReturnPath();
  }, [user, loading, isPublic, isOpen, pathname, router]);

  const signOut = useCallback(() => {
    tokens.clear();
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
