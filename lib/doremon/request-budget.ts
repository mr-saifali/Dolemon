/** Best-effort per-instance guard. Provider billing quotas remain the global backstop. */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const users = new Map<string, { started: number; count: number; busy: boolean }>();

export function acquireDoremonRequest(userId: string, now = Date.now()):
  | { allowed: true; release: () => void }
  | { allowed: false; retryAfterSeconds: number } {
  for (const [id, entry] of Array.from(users)) if (now - entry.started >= WINDOW_MS * 2) users.delete(id);
  let entry = users.get(userId);
  if (entry?.busy) return { allowed: false, retryAfterSeconds: 5 };
  if (!entry || now - entry.started >= WINDOW_MS) {
    if (!entry && users.size >= 2000) return { allowed: false, retryAfterSeconds: 60 };
    entry = { started: now, count: 0, busy: false };
    users.set(userId, entry);
  }
  if (entry.count >= MAX_REQUESTS) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - entry.started)) / 1000)) };
  entry.count++;
  entry.busy = true;
  const slot = entry;
  return { allowed: true, release: () => { slot.busy = false; } };
}
