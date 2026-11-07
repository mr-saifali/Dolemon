"use client";

import { useEffect, useState } from "react";
import { compressImage } from "./media";

const DB_NAME = "dolemon-chat-wallpaper";
const STORE = "wallpapers";
const KEY = "custom";
const CHANGE_KEY = "dolemon:wallpaper-revision";
const CHANGE_EVENT = "dolemon:wallpaper-changed";
export const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Device storage is unavailable.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Device storage is unavailable."));
    request.onblocked = () => reject(new Error("Device storage is blocked. Close other tabs and try again."));
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("Couldn't save the wallpaper."));
      tx.onabort = () => reject(tx.error ?? new Error("Couldn't save the wallpaper."));
    });
  } finally { db.close(); }
}

/** The custom image stays in this browser's IndexedDB; it is never uploaded. */
export async function loadCustomWallpaper(): Promise<string | null> {
  const value = await transact<unknown>("readonly", (store) => store.get(KEY));
  return typeof value === "string" && value.startsWith("data:image/jpeg;base64,") ? value : null;
}

/** Older WebViews may not expose createImageBitmap; decode an object URL instead. */
async function prepareWallpaper(file: File): Promise<string> {
  if (typeof createImageBitmap === "function") {
    try { return (await compressImage(file, 1600, 0.8)).dataUrl; }
    catch { /* Some browsers expose createImageBitmap but cannot decode this format. */ }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't read that image. Try another JPG, PNG or WebP."));
      img.src = objectUrl;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("Couldn't read that image.");
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't prepare that image on this device.");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally { URL.revokeObjectURL(objectUrl); }
}

export async function saveCustomWallpaper(file: File): Promise<void> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size === 0 || file.size > MAX_WALLPAPER_BYTES) throw new Error("Choose an image up to 10 MB.");
  // Resize before persistence to limit device storage usage; only decoded image
  // data is saved, never the original file, metadata, SVG, or a remote URL.
  const dataUrl = await prepareWallpaper(file);
  if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("Couldn't prepare this image.");
  await transact("readwrite", (store) => store.put(dataUrl, KEY));
  notifyChange();
}

export async function removeCustomWallpaper(): Promise<void> {
  await transact("readwrite", (store) => store.delete(KEY));
  notifyChange();
}

function notifyChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  // Notify other tabs without placing the image itself in localStorage.
  try { window.localStorage.setItem(CHANGE_KEY, `${Date.now()}-${Math.random()}`); } catch { /* local refresh still works */ }
}

export function useCustomWallpaper(enabled = true): string | null {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setImage(null); return; }
    let active = true;
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      void loadCustomWallpaper().then((value) => { if (active && current === generation) setImage(value); })
        .catch(() => { if (active && current === generation) setImage(null); });
    };
    const onStorage = (event: StorageEvent) => { if (event.key === CHANGE_KEY || event.key === null) refresh(); };
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => { active = false; window.removeEventListener(CHANGE_EVENT, refresh); window.removeEventListener("storage", onStorage); };
  }, [enabled]);
  return image;
}
