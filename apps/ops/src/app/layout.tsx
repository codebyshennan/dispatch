import type { Metadata } from "next";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ThemeProvider } from "./theme";
import { NavHeader } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beacon Ops",
  description: "AI-powered bulk CX operations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
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
