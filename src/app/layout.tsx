import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";

// Skip SSR so Convex hooks are only initialised client-side.
// This avoids build-time prerender errors when NEXT_PUBLIC_CONVEX_URL is absent.
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

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const firaSans = Fira_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beacon Ops",
  description: "AI-powered bulk CX operations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${firaCode.variable} ${firaSans.variable}`} style={{ margin: 0 }}>
        <ConvexClientProvider>
          <ThemeProvider>
            <NavHeader />
            {children}
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
