const KEY = "dolemon:app-unlocked";

/**
 * App-lock is a soft UI gate for a shared/lost phone — it is not encryption.
 *
 * The unlock lives in sessionStorage, so it survives a refresh of the same tab
 * but is gone when the app is opened fresh — that's exactly when the wall
 * should show. Re-locking while the app is open is driven by the away
 * (visibility) timer in AppGuard, not by the age of this record.
 */
type UnlockRecord = { accountId: string; at: number };

function readRecord(): UnlockRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnlockRecord> | string;
    if (typeof parsed === "string") return { accountId: parsed, at: Date.now() };
    if (parsed && typeof parsed.accountId === "string") {
      return { accountId: parsed.accountId, at: typeof parsed.at === "number" ? parsed.at : Date.now() };
    }
    return null;
  } catch {
    return null;
  }
}

export function markUnlocked(accountId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify({ accountId, at: Date.now() } satisfies UnlockRecord));
}

export function isUnlocked(accountId: string) {
  return readRecord()?.accountId === accountId;
}

/** Re-arm the wall without signing out. */
export function clearUnlocked() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}

export const AUTO_LOCK_OPTIONS = [
  { id: "instant", label: "Instantly", ms: 0 },
  { id: "1m", label: "1 min", ms: 60_000 },
  { id: "5m", label: "5 min", ms: 5 * 60_000 },
  { id: "30m", label: "30 min", ms: 30 * 60_000 },
] as const;

export type AutoLockId = (typeof AUTO_LOCK_OPTIONS)[number]["id"];

export function autoLockMs(id: AutoLockId) {
  return AUTO_LOCK_OPTIONS.find((option) => option.id === id)?.ms ?? 60_000;
}
