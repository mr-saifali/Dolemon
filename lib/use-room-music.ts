"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_ID = "5ozrYtnqgDo";
type Player = { playVideo(): void; pauseVideo(): void; destroy(): void };
type Youtube = { Player: new (element: HTMLElement, options: Record<string, unknown>) => Player };
declare global { interface Window { YT?: Youtube; onYouTubeIframeAPIReady?: () => void } }
let apiPromise: Promise<Youtube> | null = null;

function youtubeApi(): Promise<Youtube> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<Youtube>((resolve, reject) => {
    const timer = window.setTimeout(() => { apiPromise = null; reject(new Error("YouTube player timed out")); }, 12000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer); previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else { apiPromise = null; reject(new Error("YouTube player unavailable")); }
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api"; script.async = true;
    script.onerror = () => { window.clearTimeout(timer); apiPromise = null; reject(new Error("YouTube unavailable")); };
    document.head.appendChild(script);
  });
  return apiPromise;
}

type MusicState = "loading" | "playing" | "paused" | "needs-tap" | "blocked";

/** Autoplay is best effort: browsers may require a user gesture for audible audio. */
export function useRoomMusic(enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const readyRef = useRef(false);
  const creatingRef = useRef<Promise<Player | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const desired = useRef(false);
  const [state, setState] = useState<MusicState>("paused");
  const [wantsPlayback, setWantsPlayback] = useState(false);

  const clearTimer = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const armTimer = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => { if (desired.current) setState((current) => current === "playing" ? current : "needs-tap"); }, 4000);
  }, [clearTimer]);

  const ensurePlayer = useCallback(async (): Promise<Player | null> => {
    if (playerRef.current) return playerRef.current;
    if (creatingRef.current) return creatingRef.current;
    const currentGeneration = generation.current;
    const creating = (async () => {
      const container = containerRef.current;
      if (!container) return null;
      let yt: Youtube;
      try { yt = await youtubeApi(); } catch { if (generation.current === currentGeneration && desired.current) setState("blocked"); return null; }
      if (generation.current !== currentGeneration || !container.isConnected) return null;
      const host = document.createElement("div"); container.appendChild(host);
      const player = new yt.Player(host, {
        width: "1", height: "1", videoId: VIDEO_ID,
        playerVars: { autoplay: 1, loop: 1, playlist: VIDEO_ID, controls: 0, playsinline: 1, rel: 0, iv_load_policy: 3 },
        events: {
          onReady: () => { if (generation.current !== currentGeneration) return; readyRef.current = true; if (desired.current) { player.playVideo(); armTimer(); } else { player.pauseVideo(); setState("paused"); } },
          onStateChange: (event: { data: number }) => {
            if (generation.current !== currentGeneration) return;
            if (event.data === 1) {
              if (!desired.current) { player.pauseVideo(); return; }
              clearTimer(); setState("playing");
            }
          },
          onAutoplayBlocked: () => { if (generation.current === currentGeneration && desired.current) { clearTimer(); setState("needs-tap"); } },
          onError: () => { if (generation.current === currentGeneration && desired.current) { clearTimer(); setState("blocked"); } },
        },
      });
      playerRef.current = player;
      return player;
    })();
    creatingRef.current = creating;
    const result = await creating;
    if (creatingRef.current === creating) creatingRef.current = null;
    return result;
  }, [armTimer, clearTimer]);

  const play = useCallback(() => {
    desired.current = true; setWantsPlayback(true); setState("loading");
    void ensurePlayer().then((player) => { if (player && readyRef.current && desired.current) { player.playVideo(); armTimer(); } });
  }, [armTimer, ensurePlayer]);
  const stop = useCallback(() => {
    desired.current = false; setWantsPlayback(false); clearTimer(); if (readyRef.current) playerRef.current?.pauseVideo(); setState("paused");
  }, [clearTimer]);
  const toggle = useCallback(() => { if (desired.current) stop(); else play(); }, [play, stop]);

  useEffect(() => {
    if (!enabled) return;
    generation.current += 1;
    play();
    const container = containerRef.current;
    return () => {
      generation.current += 1; desired.current = false; clearTimer();
      playerRef.current?.destroy(); playerRef.current = null; readyRef.current = false; creatingRef.current = null;
      container?.replaceChildren();
    };
  }, [enabled, play, clearTimer]);

  return { state, wantsPlayback, containerRef, toggle, play, stop };
}
