import { listOfflineConversationPage, loadThread, type DbMessage } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import { loadVideoOnDevice } from "@/lib/video-storage";
import { parseVideoReference, supportedVideo, VIDEO_BUCKET } from "@/lib/video-reference";
import { CHAT_MEDIA_BUCKET, parseChatMediaReference } from "@/lib/media-url";
import { MAX_OFFLINE_ATTACHMENT_BYTES, type OfflineSyncSource } from "./snapshot";

/** Reject redirects, unrelated origins, other chats and ambiguous encoded paths. */
export function isAllowedOfflineMediaUrl(raw: string, base: string, bucket: string, conversationId: string, exactFile?: string): boolean {
  try {
    const url = new URL(raw);
    const service = new URL(base);
    if (service.protocol !== "https:" || url.protocol !== "https:" || url.origin !== service.origin || url.username || url.password || url.hash) return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(conversationId) || !/^[a-zA-Z0-9_-]+$/.test(bucket)) return false;
    const mode = exactFile ? "sign" : "public";
    const root = `${service.pathname.replace(/\/$/, "")}/storage/v1/object/${mode}/${bucket}/${conversationId}/`;
    if (!url.pathname.startsWith(root)) return false;
    const filename = url.pathname.slice(root.length);
    // Object names produced by Dolemon contain no slashes or percent escapes.
    if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename === "." || filename === "..") return false;
    return exactFile ? filename === exactFile : true;
  } catch { return false; }
}

/** Stream with a hard upper bound rather than trusting Content-Length. */
export async function downloadOfflineAttachment(url: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { signal, redirect: "error", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok || !response.body) throw new Error("Offline attachment unavailable.");
  const advertised = response.headers.get("content-length");
  if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_OFFLINE_ATTACHMENT_BYTES)) {
    await response.body.cancel();
    throw new Error("Offline attachment exceeds size limit.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_OFFLINE_ATTACHMENT_BYTES) { await reader.cancel(); throw new Error("Offline attachment exceeds size limit."); }
      // Copy into an owned ArrayBuffer before the response reader is released.
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks, { type: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" });
}

/**
 * Network source for the future Android encrypted snapshot. Not wired into the
 * app: a device-authenticated transactional native sink is still required.
 */
export function createSupabaseOfflineSource(accountId: string): OfflineSyncSource {
  const sb = getSupabase();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!sb || !base || !accountId) throw new Error("Offline sync is not configured.");
  const verifyAccount = async () => {
    const { data, error } = await sb.auth.getUser();
    if (error || data.user?.id !== accountId) throw new Error("Account changed during offline sync.");
  };
  return {
    async *conversations(signal) {
      await verifyAccount();
      let cursor: string | null = null;
      while (true) {
        if (signal.aborted) throw new DOMException("Offline sync cancelled", "AbortError");
        const page = await listOfflineConversationPage(cursor, signal);
        if (!page.length) break;
        for (const item of page) {
          if (!item.id || (cursor !== null && item.id <= cursor)) throw new Error("Offline conversation page is not ordered.");
          cursor = item.id;
        }
        yield page;
      }
      await verifyAccount();
    },
    async thread(id) { return loadThread(id, { strictOfflineSync: true }); },
    async attachment(message: DbMessage, signal) {
      const reference = message.mediaUrl;
      if (!reference) return null;
      const video = parseVideoReference(reference);
      if (video) {
        if (video.conversationId !== message.conversationId) return null;
        const local = await loadVideoOnDevice(accountId, reference).catch(() => null);
        if (local && supportedVideo(local)) return local;
        const { data, error } = await sb.storage.from(VIDEO_BUCKET).createSignedUrl(video.path, 60);
        if (error || !data?.signedUrl || !isAllowedOfflineMediaUrl(data.signedUrl, base, VIDEO_BUCKET, message.conversationId, video.videoId)) return null;
        return downloadOfflineAttachment(data.signedUrl, signal);
      }
      // private chat media: sign the stored path, then re-validate the result
      const mediaPath = parseChatMediaReference(reference);
      if (mediaPath) {
        const [folder, file] = mediaPath.split("/");
        if (folder !== message.conversationId || !file) return null;
        const { data, error } = await sb.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(mediaPath, 60);
        if (error || !data?.signedUrl || !isAllowedOfflineMediaUrl(data.signedUrl, base, CHAT_MEDIA_BUCKET, message.conversationId, file)) return null;
        return downloadOfflineAttachment(data.signedUrl, signal);
      }
      // legacy rows that still hold a public URL
      if (!isAllowedOfflineMediaUrl(reference, base, CHAT_MEDIA_BUCKET, message.conversationId)) return null;
      return downloadOfflineAttachment(reference, signal);
    },
  };
}
