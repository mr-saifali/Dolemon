"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

type PwaValue = {
  /** the browser offered a native install prompt we can fire on a tap */
  canInstall: boolean;
  /** already running from the home screen */
  installed: boolean;
  /** iOS has no prompt API — the UI shows "Share → Add to Home Screen" instead */
  ios: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

const PwaContext = createContext<PwaValue | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(Boolean(standalone));

    const ua = window.navigator.userAgent.toLowerCase();
    setIos(/iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // service worker: only in production, so local HMR never serves a stale shell
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return "unavailable" as const;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    return choice?.outcome === "accepted" ? ("accepted" as const) : ("dismissed" as const);
  }, [prompt]);

  const value = useMemo<PwaValue>(
    () => ({ canInstall: Boolean(prompt), installed, ios, install }),
    [prompt, installed, ios, install]
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("usePwa must be used inside <PwaProvider>");
  return ctx;
}
