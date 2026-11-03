"use client";

import { getSupabase } from "@/lib/supabase";
import { emptyMemory, type DoremonMemory, type DoremonMessage } from "./types";

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
    const { error } = await sb
      .from("doremon_memory")
      .upsert(
        {
          conversation_id: conversationId,
          memory: memory as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" }
      );
    if (error) return; // e.g. migration 008 pending — stay on the session copy
  } catch {
    /* Doremon's memory is best-effort; the chat must never break because of it */
  }
}

/** Ephemeral Doremon messages (greetings, interventions, answers). */
export function loadDoremonMessages(conversationId: string): DoremonMessage[] {
  if (typeof window === "undefined") return [];
  try {
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

/** true once Doremon has said his one-time hello in this conversation */
export function doremonGreeted(conversationId: string): boolean {
  if (typeof window === "undefined") return false;
  return (
    loadDoremonMessages(conversationId).some((m) => m.kind === "greeting") ||
    window.localStorage.getItem(`dolemon:doremon-met:${conversationId}`) === "1"
  );
}

export function markDoremonGreeted(conversationId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`dolemon:doremon-met:${conversationId}`, "1");
  } catch {
    /* non-fatal */
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
