"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { isDolemonAndroidShell } from "@/lib/android-app";
import {
  REFRESH_EVENT,
  isAtTop,
  pullOffset,
  pullProgress,
  shouldRefresh,
} from "@/lib/pull-to-refresh";

const RESET_MS = 650;

/**
 * Swipe down from the top of a screen to refresh it — the gesture every native
 * messaging app has and a WebView never does.
 *
 * It only arms inside our own Android shell (browsers already do their own
 * pull-to-refresh) and only when the element the finger landed on is already
 * scrolled to its very top, so scrolling up a long chat never fights it.
 * Screens listen for `dolemon:refresh` and reload their own data.
 */
export function PullToRefresh() {
  const [enabled, setEnabled] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const armed = useRef(false);
  const startY = useRef(0);
  const offsetRef = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!isDolemonAndroidShell(navigator.userAgent)) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const apply = (next: number) => {
      offsetRef.current = next;
      setOffset(next);
    };

    /** Nearest ancestor that can actually scroll — the inbox and the thread scroll themselves. */
    const scrollBox = (target: EventTarget | null): Element | null => {
      let node = target instanceof Element ? target : null;
      while (node && node !== document.body) {
        const overflow = getComputedStyle(node).overflowY;
        if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
        node = node.parentElement;
      }
      return null;
    };

    const onStart = (event: TouchEvent) => {
      armed.current = false;
      if (refreshing || event.touches.length !== 1) return;
      const box = scrollBox(event.target);
      const metrics = box ? { scrollTop: box.scrollTop, scrollHeight: box.scrollHeight, clientHeight: box.clientHeight } : null;
      if (!isAtTop(metrics)) return;
      armed.current = true;
      startY.current = event.touches[0].clientY;
    };

    const onMove = (event: TouchEvent) => {
      if (!armed.current || event.touches.length !== 1) return;
      const distance = event.touches[0].clientY - startY.current;
      if (distance <= 0) {
        if (offsetRef.current !== 0) apply(0);
        return;
      }
      // Stay out of the way of normal scrolling once the finger starts going up.
      event.preventDefault();
      apply(pullOffset(distance));
    };

    const finish = () => {
      if (!armed.current) return;
      armed.current = false;
      if (!shouldRefresh(offsetRef.current)) {
        apply(0);
        return;
      }
      apply(0);
      setRefreshing(true);
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setRefreshing(false), RESET_MS);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", finish);
    document.addEventListener("touchcancel", finish);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", finish);
      document.removeEventListener("touchcancel", finish);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [enabled, refreshing]);

  if (!enabled) return null;
  const progress = refreshing ? 1 : pullProgress(offset);
  if (!refreshing && offset === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[130] flex justify-center"
      style={{ paddingTop: "max(env(safe-area-inset-top), 10px)" }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#17171B] text-zinc-200 shadow-lg"
        style={{
          transform: `translateY(${refreshing ? 6 : offset}px) scale(${0.7 + progress * 0.3})`,
          opacity: refreshing ? 1 : Math.max(0.35, progress),
          transition: refreshing || offset === 0 ? "transform 180ms ease, opacity 180ms ease" : "none",
        }}
      >
        <ArrowDown
          className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          strokeWidth={2.2}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 180}deg)` }}
        />
      </span>
    </div>
  );
}
