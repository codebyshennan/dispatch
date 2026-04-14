"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// These must be dynamically imported with ssr:false so Convex hooks are never
// invoked during server-side rendering / static generation at build time.
const ConvexClientProvider = dynamic(
  () => import("./ConvexClientProvider").then((m) => ({ default: m.ConvexClientProvider })),
  { ssr: false }
);
const ThemeProvider = dynamic(
  () => import("./theme").then((m) => ({ default: m.ThemeProvider })),
  { ssr: false }
);
const NavHeader = dynamic(
  () => import("./nav").then((m) => ({ default: m.NavHeader })),
  { ssr: false }
);

export function ClientWrapper({ children }: { children: ReactNode }) {
  return (
    <ConvexClientProvider>
      <ThemeProvider>
        <NavHeader />
        {children}
      </ThemeProvider>
    </ConvexClientProvider>
  );
}
