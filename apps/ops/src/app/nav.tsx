"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme, BeaconLogo, ThemeToggle } from "./theme";

function NavLink({ href, label }: { href: string; label: string }) {
  const { T } = useTheme();
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 13,
        color: active ? T.text : hovered ? T.textSub : T.muted,
        textDecoration: "none",
        fontWeight: active ? 600 : 400,
        transition: "color 0.15s ease",
        padding: "4px 8px",
        borderRadius: 6,
        background: active ? T.elevated : "transparent",
      }}
    >
      {label}
    </Link>
  );
}

export function NavHeader() {
  const { T } = useTheme();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 20px",
        height: 48,
        flexShrink: 0,
        borderBottom: `1px solid ${T.border}`,
        background: T.surface,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Brand */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <BeaconLogo size={18} />
        <span
          style={{
            fontFamily: T.fontMono,
            fontWeight: 600,
            fontSize: 13,
            color: T.text,
            letterSpacing: "0.02em",
          }}
        >
          Beacon
        </span>
        <span style={{ color: T.muted, fontSize: 12 }}>/ ops</span>
      </Link>

      {/* Nav links */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 12 }}>
        <NavLink href="/" label="New job" />
        <NavLink href="/jobs" label="Job history" />
      </div>

      <div style={{ flex: 1 }} />

      <ThemeToggle />
    </header>
  );
}
