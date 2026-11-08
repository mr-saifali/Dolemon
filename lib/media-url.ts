"use client";

import { getSupabase } from "./supabase";

/**
 * Chat media lives in a PRIVATE bucket. The database stores an opaque reference
 * (`dolemon-media:<conversation>/<file>`) and the client exchanges it for a
 * short-lived signed URL. Nothing about a message makes a file publicly
 * readable without an authorised session.
 *
 * Legacy rows stored a public URL. Those are recognised too and signed the same
 * way, so history keeps loading whatever migration 016 has reached.
 */

export const CHAT_MEDIA_BUCKET = "chat-media";
const PREFIX = "dolemon-media:";
const SIGNED_URL_TTL_S = 60 * 60;
const OBJECT_PATH = /^[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]+$/;

function clean(path: string): string | null {
  const value = path.replace(/^\/+/, "").split("?")[0].split("#")[0];
  return OBJECT_PATH.test(value) ? value : null;
}

/** Turn a storage path into the value stored in `messages.media_url`. */
export function chatMediaReference(path: string): string {
  const value = clean(path);
  if (!value) throw new Error("Invalid media path.");
  return `${PREFIX}${value}`;
}

/** The storage path behind a stored reference, or null for anything else. */
export function parseChatMediaReference(value?: string | null): string | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  return clean(value.slice(PREFIX.length));
}

/** Extract the storage path from a legacy public URL (pre-migration 016). */
export function chatMediaPathFromUrl(value?: string | null): string | null {
  if (!value) return null;
  const marker = `/storage/v1/object/public/${CHAT_MEDIA_BUCKET}/`;
  const at = value.indexOf(marker);
  if (at < 0) return null;
  return clean(value.slice(at + marker.length));
}

/** The storage path for a stored value, whether new-style or legacy. */
export function chatMediaPath(value?: string | null): string | null {
  return parseChatMediaReference(value) ?? chatMediaPathFromUrl(value);
}

/** True when a value points at chat storage and therefore needs signing. */
export function isStoredMedia(value?: string | null): boolean {
  return Boolean(chatMediaPath(value));
}

type CacheEntry = { url: string | null; expiresAt: number; pending?: Promise<string | null> };

const cache = new Map<string, CacheEntry>();

/**
 * Resolve a stored value to something an <img>/<audio>/<a> can use.
 * `data:` and `blob:` URLs (optimistic local sends) pass straight through;
 * stored references and legacy public URLs are exchanged for signed URLs.
 */
export async function resolveChatMediaUrl(value?: string | null): Promise<string | null> {
  const path = chatMediaPath(value);
  if (!path) return value ?? null;

  const now = Date.now();
  const hit = cache.get(path);
  if (hit?.pending) return hit.pending;
  if (hit && hit.url && hit.expiresAt > now) return hit.url;

  const sb = getSupabase();
  if (!sb) return null;

  const pending = sb.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_S)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        cache.delete(path);
        return null;
      }
      cache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + (SIGNED_URL_TTL_S - 60) * 1000,
      });
      return data.signedUrl;
    })
    .catch(() => {
      cache.delete(path);
      return null;
    });

  cache.set(path, { url: null, expiresAt: 0, pending });
  return pending;
}

/** Sign out / account switch must not reuse another account's signed URLs. */
export function clearChatMediaCache() {
  cache.clear();
}
