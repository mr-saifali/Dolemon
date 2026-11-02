const KEY = "dolemon:app-unlocked";

/** App-lock is a soft UI gate for a shared/lost phone — it is not encryption. */
export function markUnlocked(accountId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, accountId);
}

export function isUnlocked(accountId: string) {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(KEY) === accountId;
}

export function clearUnlocked() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}
