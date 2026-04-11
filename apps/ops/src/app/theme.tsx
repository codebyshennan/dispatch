"use client";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

export type Theme = "dark" | "light";

export interface Tokens {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  accent: string;
  accentHover: string;
  text: string;
  textSub: string;
  muted: string;
  fontMono: string;
  fontBody: string;
}

export const DARK: Tokens = {
  bg: "#020617",
  surface: "#0F172A",
  elevated: "#1E293B",
  border: "#1E293B",
  accent: "#00FBEC",
  accentHover: "#00DDD0",
  text: "#F8FAFC",
  textSub: "#CBD5E1",
  muted: "#64748B",
  fontMono: "var(--font-mono), 'Cascadia Code', monospace",
  fontBody: "var(--font-body), system-ui, sans-serif",
};

export const LIGHT: Tokens = {
  bg: "#F1F5F9",
  surface: "#FFFFFF",
  elevated: "#F8FAFC",
  border: "#E2E8F0",
  accent: "#00857E",
  accentHover: "#006B65",
  text: "#0F172A",
  textSub: "#334155",
  muted: "#94A3B8",
  fontMono: "var(--font-mono), 'Cascadia Code', monospace",
  fontBody: "var(--font-body), system-ui, sans-serif",
};

interface ThemeCtx {
  theme: Theme;
  T: Tokens;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  T: DARK,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("beacon-ops-theme") as Theme | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  function toggle() {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("beacon-ops-theme", next);
      return next;
    });
  }

  const T = theme === "dark" ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ theme, T, toggle }}>
      <div
        style={{
          minHeight: "100dvh",
          background: T.bg,
          color: T.text,
          fontFamily: T.fontBody,
          transition: "background 0.2s ease, color 0.2s ease",
        }}
      >
        {children}
      </div>
      <Toaster theme={theme} richColors closeButton position="top-right" />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function BeaconLogo({ size = 20 }: { size?: number }) {
  const { T } = useTheme();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill={T.accent} />
      <path
        d="M12 2v4M12 18v4M2 12h4M18 12h4"
        stroke={T.accent}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M5.636 5.636l2.828 2.828M15.536 15.536l2.828 2.828M5.636 18.364l2.828-2.828M15.536 8.464l2.828-2.828"
        stroke={T.accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, T, toggle } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: hovered ? T.elevated : "transparent",
        cursor: "pointer",
        transition: "all 0.15s ease",
        color: T.muted,
        flexShrink: 0,
      }}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
