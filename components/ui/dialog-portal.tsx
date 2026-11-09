"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep dialogs out of transformed/clipped swipe-back screens in WebView too. */
export function DialogPortal({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return ready ? createPortal(children, document.body) : null;
}
