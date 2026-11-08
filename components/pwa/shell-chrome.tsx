"use client";

import { useEffect } from "react";
import { isDolemonAndroidShell } from "@/lib/android-app";

/** Stamped into every bundle at build time; a mismatch means a newer site is live. */
const BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";
const CHECK_EVERY_MS = 120_000;
/** Return after this long away and the shell picks up a new build, like a cold start. */
const RESUME_RELOAD_MS = 30_000;

/**
 * Chrome that only the installed Android shell gets.
 *
 * · marks the document so CSS can drop browser habits (tap flashes, text
 *   selection handles, rubber-band scrolling) — that is most of the reason the
 *   app felt like a web page;
 * · notices when a newer site build is live and re-opens it, so a merged fix
 *   reaches a phone that has been holding the app in memory for days.
 */
export function ShellChrome() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !isDolemonAndroidShell(navigator.userAgent)) return;

    const root = document.documentElement;
    root.dataset.shell = "1";

    let alive = true;
    let hiddenAt = 0;
    let lastCheck = 0;
    let stale = false;

    const reload = () => {
      if (!alive) return;
      alive = false;
      window.location.reload();
    };

    const isStale = async (): Promise<boolean> => {
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return false;
        const data = (await response.json()) as { build?: unknown };
        return typeof data.build === "string" && data.build !== BUILD;
      } catch {
        return false;
      }
    };

    const check = async () => {
      if (Date.now() - lastCheck < CHECK_EVERY_MS) return stale;
      lastCheck = Date.now();
      stale = await isStale();
      return stale;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      void (async () => {
        const outdated = await check();
        // Never yank the page out from under a quick glance back at it.
        if (outdated && away >= RESUME_RELOAD_MS) reload();
      })();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    void check();

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
      clearInterval(timer);
    };
  }, []);

  return null;
}
