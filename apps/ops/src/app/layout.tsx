import type { Metadata } from "next";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CX Ops Assistant",
  description: "AI-powered bulk CX operations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
