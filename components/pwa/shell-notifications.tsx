"use client";

import { useEffect, useRef } from "react";
import { isDolemonAndroidShell, notifyInShell } from "@/lib/android-app";
import type { ChatMessage } from "@/lib/thread";

/**
 * Android's WebView has no Push API, so a WebView app cannot be woken from the
 * server. While the shell *is* running we can still reach the notification
 * shade through the native bridge — which covers the honest case it can cover:
 * a message arriving while you are not looking at this screen.
 *
 * Browsers keep using the real service-worker push path.
 */
export function useShellNotifications(messages: ChatMessage[]) {
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !isDolemonAndroidShell(navigator.userAgent)) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    const previous = lastSeen.current;
    lastSeen.current = last.id;
    if (previous === null || previous === last.id) return;
    if (last.author !== "them") return;
    // Nobody needs a notification for the screen they are reading.
    if (document.visibilityState === "visible") return;
    notifyInShell("Dolemon", "You have a new message.");
  }, [messages]);
}
