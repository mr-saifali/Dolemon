"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePrefs } from "@/lib/prefs";

/**
 * Applies the chosen look as a data attribute on <html>. All theme-aware
 * surfaces read CSS variables (see globals.css) — one attribute flips the
 * whole app between the feminine and the masculine look.
 */
export function ThemePrefs({ children }: { children: ReactNode }) {
  const { appearance } = usePrefs();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearance;
  }, [appearance]);

  return <>{children}</>;
}
