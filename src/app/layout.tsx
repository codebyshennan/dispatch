import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ThemeProvider } from "./theme";
import { NavHeader } from "./nav";
import "./globals.css";

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
