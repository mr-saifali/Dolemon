"use client";

import { Sparkles } from "lucide-react";
import { SystemPill } from "./SystemPill";

/**
 * The thread remembers the times you were both here — but it stays a pill, not a card.
 * Content over chrome.
 */
export function PresenceMoment({ text }: { text: string }) {
  return (
    <SystemPill icon={<Sparkles className="h-3 w-3 text-rose/70" strokeWidth={2} />}>{text}</SystemPill>
  );
}
