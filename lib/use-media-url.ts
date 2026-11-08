"use client";

import { useEffect, useState } from "react";
import { isStoredMedia, resolveChatMediaUrl } from "@/lib/media-url";

/**
 * Resolve a stored media value to a usable URL. Direct values (data:, blob:)
 * are returned synchronously on the first render; private references start as
 * null and fill in once the signed URL arrives.
 */
export function useMediaUrl(reference?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isStoredMedia(reference)) {
      setUrl(reference ?? null);
      return () => {
        cancelled = true;
      };
    }
    setUrl(null);
    resolveChatMediaUrl(reference).then(
      (next) => {
        if (!cancelled) setUrl(next);
      },
      () => {
        if (!cancelled) setUrl(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return url;
}
