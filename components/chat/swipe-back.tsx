"use client";

/**
 * iOS / WhatsApp style "swipe to go back" for the chat screen.
 *
 * The trick that makes this feel native is that the inbox is never unmounted:
 * `app/app/layout.tsx` renders the inbox in the `children` slot and the chat in
 * the `@chat` parallel slot, so while a chat is open the inbox is still sitting
 * behind it. This file owns the shared value that says "how far back has the
 * chat been swiped" (0 = covering the inbox, 1 = gone), and the screen that
 * follows the finger.
 *
 * Because everything is derived from one motion value, the drag, the scale,
 * the corner radius, the shadow and the dimmed inbox all stay in lockstep —
 * and none of it re-renders React while the finger is down.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "framer-motion";
import { usePrefs } from "@/lib/prefs";

/** px of travel to the right that counts as "they meant it" */
const SWIPE_DISTANCE = 100;
/** px/s flick speed that counts even when the travel is short */
const SWIPE_FLICK_VELOCITY = 500;
/** how long the screen takes to leave once dismissed */
const LEAVE_SECONDS = 0.3;
const LEAVE_MS = LEAVE_SECONDS * 1000 + 40;
/** if the route somehow never changes, put the chat back rather than leave a blank screen */
const RESTORE_MS = 1400;
/** iOS-ish curve: quick out, soft landing */
const IOS_EASE = [0.32, 0.72, 0, 1] as const;

/**
 * Things that already own the gesture — taps, typing, in-bubble swipe-to-reply,
 * open sheets. A drag that starts on one of these is never a "go back" drag.
 * Message bubbles carry `role="button"`, which is why swipe-to-reply keeps
 * winning on a bubble while the wallpaper around it still swipes back.
 */
const OWNS_GESTURE =
  'button, a, input, textarea, select, label, [role="button"], [role="link"], [role="dialog"], [role="textbox"], [role="slider"], [contenteditable="true"], [data-swipe-back="ignore"]';

/* ------------------------------------------------------------------ *
 * Shared state, provided by `app/app/layout.tsx`
 * ------------------------------------------------------------------ */

const BackdropProgress = createContext<MotionValue<number> | null>(null);

/** null when the chat was opened as a page of its own (no inbox behind it). */
export function useChatBackdrop() {
  return useContext(BackdropProgress);
}

/**
 * The layer between the inbox and the chat screen.
 *
 * It paints the dark scrim over the inbox that fades out as the chat is pulled
 * away, and it publishes the drag progress so the scrim never needs a React
 * re-render mid-gesture.
 */
export function ChatTransitionLayer({
  children,
  chat,
}: {
  /** the inbox (and anything else routed under /app) */
  children: ReactNode;
  /** the intercepted `/app/chat/[id]` screen, or null */
  chat: ReactNode;
}) {
  // 1 = inbox alone, 0 = chat fully covering it
  const progress = useMotionValue(1);
  // A snappy spring so the scrim fades in as the chat arrives (rather than
  // snapping) and trails the finger by a hair while it is being pulled away.
  const scrim = useSpring(useTransform(progress, [0, 1], [1, 0]), {
    stiffness: 520,
    damping: 46,
    mass: 0.6,
  });

  return (
    <BackdropProgress.Provider value={progress}>
      {children}
      <motion.div
        aria-hidden="true"
        data-chat-scrim=""
        // `opacity-0` is the pre-hydration fallback: the server has no motion
        // value to serialise, and a dimmed inbox would flash on first paint.
        className="pointer-events-none fixed inset-0 z-40 bg-black/40 opacity-0"
        style={{ opacity: scrim }}
      />
      {chat}
    </BackdropProgress.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * The dismiss controller shared with the header's back arrow
 * ------------------------------------------------------------------ */

const DismissChat = createContext<(() => void) | null>(null);

/**
 * Returns the animated "go back" used by the chat header. Falls back to null
 * when a chat is rendered outside the swipe wrapper (it never is).
 */
export function useSwipeBackDismiss() {
  return useContext(DismissChat);
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

/**
 * Wraps the whole chat UI so the screen itself follows the finger: right,
 * slightly smaller, rounder, with a shadow — and finally off to the right.
 */
export function SwipeBackWrapper({
  children,
  fallbackHref = "/app",
}: {
  children: ReactNode;
  /** used when there is no inbox history to go back to (a deep link) */
  fallbackHref?: string;
}) {
  const router = useRouter();
  const { reduceMotion } = usePrefs();
  const backdrop = useChatBackdrop();
  const dragControls = useDragControls();

  const frame = useRef<HTMLDivElement | null>(null);
  const span = useRef(0);
  const leaving = useRef(false);
  const navigated = useRef(false);
  const mounted = useRef(true);
  const [dragging, setDragging] = useState(false);

  const x = useMotionValue(0);

  /** 0 while the chat covers the screen, 1 once it has been swiped away */
  const progress = useTransform(x, (latest) => {
    const width = span.current || 1;
    return Math.min(1, Math.max(0, latest / width));
  });

  const scale = useTransform(progress, [0, 1], [1, 0.9]);
  const borderRadius = useTransform(progress, [0, 0.45], [0, 16], { clamp: true });
  const opacity = useTransform(progress, [0.6, 1], [1, 0.8]);
  const boxShadow = useTransform(
    progress,
    [0, 1],
    ["0px 0px 0px 0px rgba(0,0,0,0)", "0px 18px 48px 0px rgba(0,0,0,0.66)"]
  );

  // Mirror the drag into the layer's scrim value (no React state, no re-render).
  useEffect(() => {
    if (!backdrop) return;
    const push = (value: number) => backdrop.set(value);
    push(progress.get());
    const stop = progress.on("change", push);
    return () => {
      stop();
      // The chat is being unmounted — including by the browser's own back
      // button, which bypasses our animation. Either way the inbox is now the
      // only thing on screen, so the scrim goes away immediately.
      backdrop.set(1);
    };
  }, [backdrop, progress]);

  /**
   * Navigate once, whichever path got us here. Inside the parallel-route layer
   * `router.back()` lands on the inbox with its scroll position intact; for a
   * deep link there is nothing to go back to, so we replace the entry instead.
   */
  const finish = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    if (backdrop) router.back();
    else router.replace(fallbackHref);
  }, [backdrop, fallbackHref, router]);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (reduceMotion || typeof window === "undefined") {
      finish();
      return;
    }
    const width = span.current || window.innerWidth || 1;
    animate(x, width * 1.02, { duration: LEAVE_SECONDS, ease: IOS_EASE });
    window.setTimeout(finish, LEAVE_MS);
    window.setTimeout(() => {
      // The route never changed (blocked history, offline shell…): come back.
      if (!mounted.current || navigated.current) return;
      leaving.current = false;
      animate(x, 0, { type: "spring", stiffness: 380, damping: 40, mass: 0.7 });
    }, RESTORE_MS);
  }, [finish, reduceMotion, x]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Only start the screen-following drag for gestures nothing else owns. */
  const owns = useCallback((target: EventTarget | null, root: HTMLElement | null) => {
    if (!(target instanceof Element) || !root) return false;
    if (target.closest(OWNS_GESTURE)) return false;
    // Don't steal a drag from a horizontal rail (attachment strip, link preview…).
    for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
      const { overflowX } = getComputedStyle(node);
      if (
        (overflowX === "auto" || overflowX === "scroll") &&
        node.scrollWidth > node.clientWidth + 8
      ) {
        return false;
      }
    }
    return true;
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (leaving.current || reduceMotion) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!owns(event.target, frame.current)) return;
    span.current = frame.current?.offsetWidth || window.innerWidth;
    dragControls.start(event);
  };

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    setDragging(false);
    // Far enough, or flicked fast enough.
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_FLICK_VELOCITY) {
      leave();
      return;
    }
    // Not far enough: snap home. This also overrides Framer's own bounce-back,
    // so a spring we control is the only thing touching `x`.
    animate(x, 0, { type: "spring", stiffness: 420, damping: 42, mass: 0.7 });
  };

  return (
    <DismissChat.Provider value={leave}>
      <motion.div
        ref={frame}
        data-swipe-back-screen=""
        drag="x"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        dragMomentum={false}
        onPointerDown={onPointerDown}
        onDragStart={() => {
          if (!span.current) span.current = window.innerWidth;
          setDragging(true);
        }}
        onDragEnd={onDragEnd}
        style={{
          x,
          scale,
          borderRadius,
          opacity,
          boxShadow,
          touchAction: "pan-y",
        }}
        className={`fixed inset-0 z-50 overflow-hidden bg-[#09090B] will-change-transform ${
          dragging ? "select-none" : ""
        }`}
      >
        {children}
      </motion.div>
    </DismissChat.Provider>
  );
}
