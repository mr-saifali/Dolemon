"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { usePrefs } from "@/lib/prefs";

/** Honours both the OS setting and the in-app "reduce motion" switch. */
export function MotionPrefs({ children }: { children: ReactNode }) {
  const { reduceMotion } = usePrefs();
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}
