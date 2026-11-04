"use client";

import { getSupabase } from "@/lib/supabase";
import { emptyMemory, type DoremonMemory, type DoremonMessage, type DoremonStats } from "./types";

const MEM_PREFIX = "doremon:mem:";
const MSG_PREFIX = "doremon:msgs:";
const MAX_MSGS = 40;

/**
 * Doremon's compressed record for one conversation.
 *
 * Live mode → the `doremon_memory` table (migration 008), shared between both
 * members, instant to fetch. Demo mode → a localStorage ring.
 */

export async function loadDoremonMemory(conversationId: string, remote: boolean): Promise<DoremonMemory | null> {
  if (!remote) return readLocalMem(conversationId);
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("doremon_memory")
      .select("memory")
      .eq("conversation_id", conversationId)
      .maybeSingle<{ memory: DoremonMemory }>();
    if (error) return null; // table missing (migration 008 not run yet) — Doremon keeps a session memory
    return (data?.memory as DoremonMemory | null) ?? null;
  } catch {
    return null;
  }
}

export async function saveDoremonMemory(
  conversationId: string,
  memory: DoremonMemory,
  remote: boolean
): Promise<void> {
  if (!remote) return void writeLocalMem(conversationId, memory);
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getUser();
    const me = data.user?.id;
    if (!me) return;
    // The record is per-user: my Doremon keeps MY private copy of this
    // conversation (migration 010). It also survives the chat being deleted.
    const { error } = await sb
      .from("doremon_memory")
      .upsert(
        {
          conversation_id: conversationId,
          user_id: me,
          memory: memory as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" }
      );
    if (error) return; // e.g. migration 010 pending — stay on the session copy
  } catch {
    /* Doremon's memory is best-effort; the chat must never break because of it */
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

/**
 * Ephemeral Doremon messages.
 *
 * Since "Doremon only speaks when summoned" we wipe his old greetings and
 * interventions once, on the first load after the update — he starts every
 * conversation silent, and only new /doremon answers accumulate again.
 */
const WIPED_FLAG = "dolemon:msgs-cleared-v2";

export function loadDoremonMessages(conversationId: string): DoremonMessage[] {
  if (typeof window === "undefined") return [];
  try {
    if (window.localStorage.getItem(WIPED_FLAG) !== "1") {
      const doomed: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(MSG_PREFIX)) doomed.push(key);
      }
      doomed.forEach((key) => window.localStorage.removeItem(key));
      window.localStorage.setItem(WIPED_FLAG, "1");
      return [];
    }
    const raw = window.localStorage.getItem(MSG_PREFIX + conversationId);
    return raw ? ((JSON.parse(raw) as DoremonMessage[]).slice(-MAX_MSGS) ?? []) : [];
  } catch {
    return [];
  }
}

export function saveDoremonMessages(conversationId: string, messages: DoremonMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MSG_PREFIX + conversationId, JSON.stringify(messages.slice(-MAX_MSGS)));
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

function writeLocalMem(conversationId: string, memory: DoremonMemory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MEM_PREFIX + conversationId, JSON.stringify(memory));
  } catch {
    /* quota — keep going with in-memory state */
  }
}

export { emptyMemory };
