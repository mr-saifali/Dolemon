"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CONFIRM_ACTION_EVENT, type ConfirmationRequest } from "@/lib/confirm-action";
import { ConfirmDialog } from "./confirm-dialog";

export function ConfirmationHost() {
  const pathname = usePathname();
  const pending = useRef<ConfirmationRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    // Never approve a stale request after navigating to another conversation.
    pending.current?.resolve(false);
    pending.current = null;
    setMessage(null);
  }, [pathname]);
  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<ConfirmationRequest>).detail;
      request.handled = true;
      if (pending.current) { request.resolve(false); return; }
      pending.current = request;
      setMessage(request.message);
    };
    window.addEventListener(CONFIRM_ACTION_EVENT, receive);
    return () => {
      window.removeEventListener(CONFIRM_ACTION_EVENT, receive);
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, []);
  const finish = (answer: boolean) => {
    const request = pending.current;
    pending.current = null;
    setMessage(null);
    request?.resolve(answer);
  };
  return <ConfirmDialog open={message !== null} title="Share selected context with AI?" description={message ?? ""} confirmLabel="Allow this request" onConfirm={() => finish(true)} onCancel={() => finish(false)} />;
}
