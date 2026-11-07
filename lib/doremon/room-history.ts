import type { RoomTurn } from "./types";

const PREFIX = "doremon:room:v2:";
const key = (userId: string, conversationId: string) => `${PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(conversationId)}`;

/** The last five exchanges are device-local and scoped to the signed-in user. */
export function loadRoomHistory(userId: string | null, conversationId: string): RoomTurn[] | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(userId, conversationId));
    if (raw === null) return null;
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows.filter((v): v is RoomTurn => v && typeof v.id === "string" && typeof v.q === "string" && typeof v.a === "string" && typeof v.at === "number").slice(-5);
  } catch { return null; }
}

export function saveRoomHistory(userId: string | null, conversationId: string, turns: RoomTurn[]): boolean {
  if (!userId || typeof window === "undefined") return false;
  try { window.localStorage.setItem(key(userId, conversationId), JSON.stringify(turns.slice(-5))); return true; }
  catch { return false; }
}

export function deleteRoomHistory(userId: string | null, conversationId: string): void {
  if (!userId || typeof window === "undefined") return;
  try { window.localStorage.removeItem(key(userId, conversationId)); } catch { /* storage unavailable */ }
}
