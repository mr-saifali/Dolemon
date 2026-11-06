"use client";

import { getSupabase } from "@/lib/supabase";
import { MAX_VIDEO_BYTES, VIDEO_BUCKET, parseVideoReference, supportedVideo, videoReference } from "@/lib/video-reference";
const DB_NAME = "dolemon-device-videos";
const STORE = "videos";

function key(accountId: string, ref: string) { return `${accountId}:${ref}`; }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Device storage unavailable."));
    request.onblocked = () => reject(new Error("Device storage is blocked. Close other tabs and try again."));
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode); const request = operation(tx.objectStore(STORE));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("Device storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Device storage failed."));
    });
  } finally { db.close(); }
}
export async function saveVideoOnDevice(accountId: string, reference: string, blob: Blob): Promise<void> {
  if (!accountId || !parseVideoReference(reference) || !supportedVideo(blob)) throw new Error("Unsupported video or video is over 50 MB.");
  await transaction("readwrite", (store) => store.put(blob, key(accountId, reference)));
}
export async function loadVideoOnDevice(accountId: string, reference: string): Promise<Blob | null> {
  if (!accountId || !parseVideoReference(reference)) return null;
  return (await transaction<Blob | undefined>("readonly", (store) => store.get(key(accountId, reference)))) ?? null;
}
export async function removeVideoFromDevice(accountId: string, reference: string): Promise<void> {
  await transaction("readwrite", (store) => store.delete(key(accountId, reference)));
}


/** Best-effort cleanup for videos belonging to one account and chat. */
export async function clearConversationVideos(accountId: string, conversationId: string): Promise<void> {
  const prefix = `${accountId}:dolemon-video:${conversationId}:`;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (typeof current.key === "string" && current.key.startsWith(prefix)) current.delete();
        current.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Device storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Device storage failed."));
    });
  } finally { db.close(); }
}

/** Save first, then upload a bounded Blob directly to the private temporary bucket. */
export async function prepareVideo(accountId: string, conversationId: string, file: File, remote: boolean): Promise<string> {
  if (!supportedVideo(file)) throw new Error("Choose an MP4, WebM, or MOV video up to 50 MB.");
  const reference = videoReference(conversationId, crypto.randomUUID());
  const parsed = parseVideoReference(reference)!;
  await saveVideoOnDevice(accountId, reference, file);
  if (!remote) return reference;
  try {
    const db = getSupabase();
    if (!db) throw new Error("Video storage is not configured.");
    const { data: session } = await db.auth.getSession();
    if (!session.session || session.session.user.id !== accountId) throw new Error("Sign in again before sending a video.");
    const { error: registryError } = await db.from("temporary_chat_videos").insert({ id: parsed.videoId, conversation_id: conversationId, sender_id: accountId });
    if (registryError) throw new Error("Temporary video storage is not set up yet, or this chat is unavailable.");
    const { error } = await db.storage.from(VIDEO_BUCKET).upload(parsed.path, file, { contentType: file.type, upsert: false, cacheControl: "0" });
    if (error) throw new Error("Video upload failed. Check your connection and try again.");
    return reference;
  } catch (error) {
    await removeVideoFromDevice(accountId, reference).catch(() => undefined);
    throw error;
  }
}

/** Download, commit locally, and only then attempt to remove the server copy. */
export async function receiveVideo(accountId: string, reference: string): Promise<{ blob: Blob; serverRemoved: boolean }> {
  const parsed = parseVideoReference(reference);
  const db = getSupabase();
  if (!parsed || !db) throw new Error("Video unavailable.");
  const { data, error } = await db.storage.from(VIDEO_BUCKET).download(parsed.path);
  if (error || !data) throw new Error("Video is unavailable or has expired. Ask the sender to share it again.");
  if (data.size > MAX_VIDEO_BYTES || !supportedVideo(data)) throw new Error("This video format isn’t supported.");
  await saveVideoOnDevice(accountId, reference, data);
  const removed = await db.storage.from(VIDEO_BUCKET).remove([parsed.path]).then(({ data: removedItems, error: removeError }) => !removeError && Boolean(removedItems?.length), () => false);
  return { blob: data, serverRemoved: removed };
}
