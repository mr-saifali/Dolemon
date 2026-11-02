"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveCall } from "@/lib/live-call";
import type { CallType } from "@/lib/live-call";

/**
 * `/app/call/<id>` is kept as a deep-link entry point. The call itself lives in the
 * global overlay, so we start it and drop the person back into the room underneath.
 */
export function LiveCallLauncher({
  conversationId,
  type,
}: {
  conversationId: string;
  type: CallType;
}) {
  const router = useRouter();
  const { start } = useLiveCall();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void start(conversationId, type);
    router.replace(`/app/chat/${conversationId}`);
  }, [conversationId, router, start, type]);

  return null;
}
