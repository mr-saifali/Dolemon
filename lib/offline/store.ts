import type { DbConversation, DbMessage } from "../db";

/**
 * Account-scoped, on-device cache of the inbox and recent threads.
 *
 * The app already restores the account from localStorage before touching the
 * network, so the shell can boot offline; this module is what lets the *data*
 * be there too. Reads are best-effort: a missing IndexedDB (private mode, a
 * very old WebView) must look exactly like an empty cache, never like an error.
 *
 * Nothing here is shared between accounts: every key is prefixed with the
 * signed-in account id, and signing out deletes the whole database.
 */
const DB_NAME = "dolemon-offline";
const DB_VERSION = 1;
const CONVERSATIONS = "conversations";
const THREADS = "threads";

/** Keep the cache small enough to write quickly on a phone. */
export const MAX_CACHED_MESSAGES = 300;

let scope: string | null = null;

/** Called by the session provider whenever the signed-in account changes. */
export function setOfflineScope(accountId: string | null): void {
  scope = accountId ? accountId : null;
}

export function offlineScope(): string | null {
  return scope;
}

export type CachedThread = { messages: DbMessage[]; me: string | null; savedAt: number };
export type CachedConversations = { rows: DbConversation[]; savedAt: number };

let opening: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (opening) return opening;
  opening = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATIONS)) db.createObjectStore(CONVERSATIONS);
      if (!db.objectStoreNames.contains(THREADS)) db.createObjectStore(THREADS);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
}

function read<T>(action: (db: IDBDatabase) => IDBRequest<T> | null): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        let request: IDBRequest<T> | null = null;
        try {
          request = action(db);
        } catch {
          return resolve(null);
        }
        if (!request) return resolve(null);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      })
  );
}

/** Resolves when the transaction commits (or fails silently). */
function write(action: (db: IDBDatabase) => IDBTransaction | null): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve();
        let tx: IDBTransaction | null = null;
        try {
          tx = action(db);
        } catch {
          return resolve();
        }
        if (!tx) return resolve();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      })
  );
}

function threadKey(accountId: string, conversationId: string) {
  return `${accountId}:${conversationId}`;
}

/** Newest messages win, and only the tail is kept. */
export function trimForCache(messages: DbMessage[]): DbMessage[] {
  if (messages.length <= MAX_CACHED_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_CACHED_MESSAGES);
}

export async function cacheConversations(rows: DbConversation[]): Promise<void> {
  const accountId = scope;
  if (!accountId || !rows.length) return;
  await write((db) => {
    const tx = db.transaction(CONVERSATIONS, "readwrite");
    tx.objectStore(CONVERSATIONS).put({ rows, savedAt: Date.now() } satisfies CachedConversations, accountId);
    return tx;
  });
}

export async function readConversations(): Promise<DbConversation[] | null> {
  const accountId = scope;
  if (!accountId) return null;
  const row = await read<CachedConversations>((db) => {
    const tx = db.transaction(CONVERSATIONS, "readonly");
    return tx.objectStore(CONVERSATIONS).get(accountId);
  });
  return Array.isArray(row?.rows) && row.rows.length ? row.rows : null;
}

export async function cacheThread(conversationId: string, messages: DbMessage[], me: string | null): Promise<void> {
  const accountId = scope;
  if (!accountId || !messages.length) return;
  const row: CachedThread = { messages: trimForCache(messages), me, savedAt: Date.now() };
  await write((db) => {
    const tx = db.transaction(THREADS, "readwrite");
    tx.objectStore(THREADS).put(row, threadKey(accountId, conversationId));
    return tx;
  });
}

export async function readThread(conversationId: string): Promise<CachedThread | null> {
  const accountId = scope;
  if (!accountId) return null;
  const row = await read<CachedThread>((db) => {
    const tx = db.transaction(THREADS, "readonly");
    return tx.objectStore(THREADS).get(threadKey(accountId, conversationId));
  });
  return row && Array.isArray(row.messages) ? row : null;
}

/** A deleted chat must not come back from the cache. */
export async function forgetThread(conversationId: string): Promise<void> {
  const accountId = scope;
  if (!accountId) return;
  await write((db) => {
    const tx = db.transaction(THREADS, "readwrite");
    tx.objectStore(THREADS).delete(threadKey(accountId, conversationId));
    return tx;
  });
}

/** Ask the service worker to drop cached pages and RSC payloads (sign-out). */
export function purgePageCache(): void {
  try {
    if (typeof navigator === "undefined") return;
    navigator.serviceWorker?.controller?.postMessage({ type: "dolemon:clear-cache" });
  } catch {
    /* no service worker: nothing cached by us */
  }
}

/** Sign-out: the cache belongs to the account that just left. */
export async function clearOfflineData(): Promise<void> {
  scope = null;
  if (typeof indexedDB === "undefined") return;
  const previous = opening;
  opening = null;
  (await previous)?.close();
  await new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
