import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AuthProvider } from "@/components/providers/AuthProvider";
import { CelebrationProvider } from "@/components/providers/CelebrationProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { themeBootstrapScript } from "@/lib/themes";

import "./globals.css";

const appFont = Plus_Jakarta_Sans({
  variable: "--font-app",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Safar — plan trips with your people",
  description:
    "Plan trips, follow the day's plan while you travel, split what you spend and earn XP along the way.",
};

export const viewport: Viewport = {
  themeColor: "#c2410c",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${appFont.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint so colours never flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only-text focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[80] focus:rounded-xl focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <AuthProvider>
            <CelebrationProvider>{children}</CelebrationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
