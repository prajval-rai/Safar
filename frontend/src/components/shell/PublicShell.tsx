"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { rememberReturnPath } from "@/lib/returnPath";

/** The frame for pages anyone can read (the Feed, a shared story) when
 *  nobody is signed in: the brand, and a way in that comes back here. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function go(path: "/login" | "/signup") {
    rememberReturnPath(pathname);
    router.push(path);
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div
          className="mx-auto flex h-[64px] w-full max-w-6xl items-center gap-3 px-4 sm:px-8"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <Link href="/feed" className="text-lg font-extrabold tracking-wide text-brand">
            SAFAR
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => go("/login")}>
              Log in
            </Button>
            <Button size="sm" onClick={() => go("/signup")}>
              Sign up
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-8">
        {children}
      </main>
    </div>
  );
}
