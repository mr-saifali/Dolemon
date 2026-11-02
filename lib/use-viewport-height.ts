"use client";

import { useEffect } from "react";

/**
 * iOS Safari lets the keyboard sit *over* a 100dvh layout. Mirroring
 * visualViewport.height into a CSS variable keeps the composer above the keyboard
 * instead of under it.
 */
export function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const visual = window.visualViewport;

    const apply = () => {
      const height = visual ? visual.height : window.innerHeight;
      root.style.setProperty("--app-vh", `${Math.round(height)}px`);
    };

    apply();
    visual?.addEventListener("resize", apply);
    visual?.addEventListener("scroll", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      visual?.removeEventListener("resize", apply);
      visual?.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", apply);
      root.style.removeProperty("--app-vh");
    };
  }, []);
}
