"use client";

import { getSupabase } from "@/lib/supabase";
import { emptyMemory, type DoremonMemory, type DoremonMessage, type DoremonStats } from "./types";

const MEM_PREFIX = "doremon:mem:";
const MSG_PREFIX = "doremon:msgs:";
const MAX_MSGS = 40;

/**
 * Doremon's compressed record for one conversation.
 *
 * Live mode → per-user `doremon_memory` (migration 010 or later).
 * Demo mode → a localStorage ring.
 */

export async function loadDoremonMemory(conversationId: string, remote: boolean): Promise<DoremonMemory | null> {
  if (!remote) return readLocalMem(conversationId);
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user?.id) return null;
    const { data, error } = await sb
      .from("doremon_memory")
      .select("memory")
      .eq("user_id", auth.user.id)
      .eq("conversation_id", conversationId)
      .maybeSingle<{ memory: DoremonMemory }>();
    if (error) return null; // table missing (migration 008 not run yet) — Doremon keeps a session memory
    return (data?.memory as DoremonMemory | null) ?? null;
  } catch {
    return null;
  }
}

/** Explicit edits report failures instead of silently pretending they saved. */
export async function replaceDoremonMemory(conversationId: string, memory: DoremonMemory, remote: boolean): Promise<void> {
  if (!remote) {
    if (typeof window === "undefined") throw new Error("Local storage is unavailable");
    window.localStorage.setItem(MEM_PREFIX + conversationId, JSON.stringify(memory));
    return;
  }
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is unavailable");
  const { data, error: authError } = await sb.auth.getUser();
  if (authError || !data.user?.id) throw new Error("Sign in to update memory");
  const { error } = await sb.from("doremon_memory").upsert({
    conversation_id: conversationId, user_id: data.user.id,
    memory: memory as unknown as Record<string, unknown>, updated_at: new Date().toISOString(),
  }, { onConflict: "conversation_id,user_id" });
  if (error) throw new Error(error.message);
}

/** Automatic memory persistence remains best-effort and must not break chat. */
export async function saveDoremonMemory(conversationId: string, memory: DoremonMemory, remote: boolean): Promise<void> {
  try { await replaceDoremonMemory(conversationId, memory, remote); } catch { /* chat remains usable */ }
}

/** Delete only this user's copy and this device's local Doremon messages. */
export async function deleteDoremonMemory(conversationId: string, remote: boolean, localUserId?: string | null): Promise<void> {
  if (remote) {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase is unavailable");
    const { data, error: authError } = await sb.auth.getUser();
    if (authError || !data.user?.id) throw new Error("Sign in to delete memory");
    localUserId = data.user.id;
    const { error } = await sb.from("doremon_memory").delete().eq("user_id", data.user.id).eq("conversation_id", conversationId);
    if (error) throw new Error(error.message);
  }
  if (typeof window !== "undefined") {
    if (!remote) window.localStorage.removeItem(MEM_PREFIX + conversationId);
    window.localStorage.removeItem(MSG_PREFIX + conversationId);
    if (localUserId) window.localStorage.removeItem(messageKey(conversationId, localUserId));
  }
}

export type DoremonRecord = {
  conversationId: string;
  memory: DoremonMemory;
  updatedAt: number;
  /** false once the chat itself is deleted — the record survives anyway */
  alive: boolean;
};

/** Every conversation my Doremon has a record of (deleted chats included). */
export async function loadDoremonRecords(remote: boolean): Promise<DoremonRecord[]> {
  if (!remote) {
    // demo mode — collect the local ring's conversations that have a record
    if (typeof window === "undefined") return [];
    const out: DoremonRecord[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(MEM_PREFIX)) continue;
      const memory = readLocalMem(key.slice(MEM_PREFIX.length));
      if (memory) out.push({ conversationId: key.slice(MEM_PREFIX.length), memory, updatedAt: memory.updatedAt, alive: true });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb.rpc("doremon_records");
    if (error || !data) return []; // migration 010 pending — the section simply stays hidden
    return (data as { conversation_id: string; memory: DoremonMemory; updated_at: string; alive: boolean }[]).map(
      (row) => ({
        conversationId: row.conversation_id,
        memory: row.memory,
        updatedAt: new Date(row.updated_at).getTime(),
        alive: row.alive,
      })
    );
  } catch {
    return [];
  }
}

/** The talking census of a conversation (who talks more, when, who starts). */
export async function loadDoremonStats(
  conversationId: string,
  remote: boolean
): Promise<DoremonStats | null> {
  if (!remote) return null;
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc("doremon_stats", { target: conversationId });
    if (error || !data || (data as DoremonStats).total === 0) return null;
    return data as DoremonStats;
  } catch {
    return null;
  }
}

/** Doremon responses stored locally for this conversation. */
const messageKey = (conversationId: string, userId: string) => `${MSG_PREFIX}v2:${encodeURIComponent(userId)}:${encodeURIComponent(conversationId)}`;

export function loadDoremonMessages(conversationId: string, userId: string | null): DoremonMessage[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(messageKey(conversationId, userId));
    return raw ? ((JSON.parse(raw) as DoremonMessage[]).slice(-MAX_MSGS) ?? []) : [];
  } catch {
    return [];
  }
}

export function saveDoremonMessages(conversationId: string, messages: DoremonMessage[], userId: string | null): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(messageKey(conversationId, userId), JSON.stringify(messages.slice(-MAX_MSGS)));
  } catch {
    /* quota — drop persistence, keep the session */
  }
}

function readLocalMem(conversationId: string): DoremonMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MEM_PREFIX + conversationId);
    return raw ? (JSON.parse(raw) as DoremonMemory) : null;
  } catch {
    return null;
  }
}

export { emptyMemory };
