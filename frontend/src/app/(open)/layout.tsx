"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import { PublicShell } from "@/components/shell/PublicShell";
import { LoadingBlock } from "@/components/ui/Bits";

/** Pages anyone can read. Signed in, they sit in the normal app; signed out,
 *  in a light public frame with Log in / Sign up. */
export default function OpenLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingBlock />;
  return user ? <AppShell>{children}</AppShell> : <PublicShell>{children}</PublicShell>;
}
