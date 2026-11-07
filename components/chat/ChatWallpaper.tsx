"use client";

import { useMemo, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { isNightArtwork, isVividChatTheme, type ChatTheme } from "@/lib/chat-themes";
import { useCustomWallpaper } from "@/lib/custom-wallpaper";

/** Text and labels sit on darkened wallpaper, including uploaded images. */
export function chatThemeStyle(theme: ChatTheme): CSSProperties {
  return {
    "--message-outline": theme.outline,
    "--message-incoming": isVividChatTheme(theme) ? "rgba(0,0,0,.7)" : "rgba(0,0,0,.2)",
    "--chat-label-bg": "rgba(0,0,0,.55)",
    "--chat-label-text": "#f4f4f5",
  } as CSSProperties;
}

export function ChatWallpaper({ theme, reduceMotion = false }: { theme: ChatTheme; reduceMotion?: boolean }) {
  const custom = useCustomWallpaper(theme.id === "custom");
  const systemReduceMotion = useReducedMotion();
  // Keep React keys short even for large data URLs, while changing the key when
  // an image is replaced so that the new wallpaper cross-fades in.
  const customKey = useMemo(() => {
    if (!custom) return "empty";
    let hash = 2166136261;
    for (let i = 0; i < custom.length; i++) hash = Math.imul(hash ^ custom.charCodeAt(i), 16777619);
    return `${custom.length}-${hash >>> 0}`;
  }, [custom]);
  const key = theme.id === "custom" ? `${theme.id}:${customKey}` : theme.id;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#09090B]">
      <AnimatePresence initial={false}>
        <motion.div key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion || systemReduceMotion ? 0 : 0.3, ease: "easeInOut" }} className="absolute inset-0 overflow-hidden">
          {theme.id === "soft-glow" || (theme.id === "custom" && !custom) ? (
            <>
              <div className="absolute -right-16 -top-24 h-80 w-80 rounded-full bg-[#FF5C7A]/10 blur-[100px]" />
              <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-[#6B4CFF]/10 blur-[100px]" />
            </>
          ) : theme.id === "midnight" ? (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_10%,#142650_0%,#0a1020_42%,#050507_100%)]" />
              <div className="absolute inset-0 bg-[url('/chat-themes/noise.svg')] opacity-20" />
            </>
          ) : theme.id === "rosewater" ? (
            <>
              <div className="absolute inset-0 bg-[linear-gradient(145deg,#cea9aa_0%,#c39aa5_50%,#aa8ea8_100%)]" />
              <div className="absolute inset-0 bg-black/40" />
            </>
          ) : theme.id === "pattern" ? (
            <>
              <div className="absolute inset-0 bg-[#121212]" />
              <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:18px_18px]" />
            </>
          ) : theme.id === "solid" ? (
            <div className="absolute inset-0 bg-black" />
          ) : theme.id === "custom" && custom ? (
            <>
              {/* The image is stored locally and kept behind the dark contrast layer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={custom} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" />
              <div className="absolute inset-0 bg-black/60" />
            </>
          ) : theme.image ? (
            <>
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${theme.image})` }} />
              <div className={isVividChatTheme(theme) || isNightArtwork(theme) ? "absolute inset-0 bg-black/10" : "absolute inset-0 bg-black/60"} />
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
