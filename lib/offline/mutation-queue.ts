import { isReactionType, type ReactionType } from "@/lib/reactions";

/**
 * Queue protocol groundwork only: there is deliberately no production store or
 * network adapter yet. Do not persist this in web storage. The eventual native
 * store must encrypt the queue and snapshot, enforce the device-credential gate,
 * and invalidate the session generation before sign-out/account changes.
 */
export type OfflineMutation = {
  id: string;
  accountId: string;
  conversationId: string;
  messageId: string;
  createdAt: number;
  /** Opaque server revision of the original message/reaction, never a local clock. */
  expectedRevision: string;
} & (
  | { kind: "edit"; text: string }
  | { kind: "delete" }
  | { kind: "reaction"; reaction: ReactionType | null }
);

export type QueueEntry = { mutation: OfflineMutation; status: "pending" | "inflight" | "conflict" };
export type QueueState = { revision: number; entries: QueueEntry[] };
export type OfflineSession = { accountId: string; generation: string };
export type AuthoritativeResult = { messageId: string; conversationId: string; revision: string } & (
  | { kind: "edit"; text: string; editedAt: string }
  | { kind: "delete" }
  | { kind: "reaction"; reaction: ReactionType | null }
);
export type ServerOutcome =
  | { status: "confirmed"; authoritative: AuthoritativeResult }
  | { status: "conflict" };

/**
 * All operations must verify the native account AND generation while holding
 * the same lock/transaction as their write. `acknowledge` must atomically apply
 * the authoritative result to the encrypted snapshot and remove the matching
 * queue entry; failure must leave both unchanged. No network URLs or auth tokens
 * should be added to the saved snapshot. An adapter must reject stale sessions.
 */
export interface OfflineQueueStore {
  read(session: OfflineSession): Promise<QueueState>;
  compareAndSwap(session: OfflineSession, revision: number, entries: QueueEntry[]): Promise<boolean>;
  acknowledge(session: OfflineSession, revision: number, mutation: OfflineMutation, authoritative: AuthoritativeResult): Promise<boolean>;
}

/**
 * The server MUST authenticate the account, verify membership/ownership and
 * expectedRevision, and durably deduplicate each account + operation id in the
 * SAME database transaction as the mutation. A lost response must return the
 * same authoritative receipt when retried. Ordinary edit/delete/reaction APIs
 * do not meet this contract and must not be used as this adapter.
 */
export interface OfflineMutationServer {
  apply(session: OfflineSession, mutation: OfflineMutation, signal: AbortSignal): Promise<ServerOutcome>;
}

const MAX_QUEUE = 1000;
const MAX_RETRIES = 32;
const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 10_000;

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}
export function validateOfflineMutation(session: OfflineSession, mutation: OfflineMutation) {
  if (!mutation || typeof mutation !== "object" || Array.isArray(mutation)) throw new Error("Invalid offline change.");
  const keys = ["id", "accountId", "conversationId", "messageId", "createdAt", "expectedRevision", "kind", ...(mutation.kind === "edit" ? ["text"] : mutation.kind === "reaction" ? ["reaction"] : [])];
  if (Object.keys(mutation).some((key) => !keys.includes(key))) throw new Error("Invalid offline change fields.");
  if (!validId(session.accountId) || !validId(session.generation) || !validId(mutation.id)
      || mutation.accountId !== session.accountId || !validId(mutation.conversationId) || !validId(mutation.messageId)
      || !Number.isSafeInteger(mutation.createdAt) || mutation.createdAt < 0
      || typeof mutation.expectedRevision !== "string" || !mutation.expectedRevision || mutation.expectedRevision.length > 1024) {
    throw new Error("Invalid offline change or session.");
  }
  if (mutation.kind === "edit") {
    if (typeof mutation.text !== "string" || mutation.text !== mutation.text.trim() || !mutation.text || mutation.text.length > MAX_TEXT_LENGTH) throw new Error("Invalid offline edit.");
  } else if (mutation.kind === "reaction") {
    if (mutation.reaction !== null && !isReactionType(mutation.reaction)) throw new Error("Invalid offline reaction.");
  } else if (mutation.kind !== "delete") {
    // Sending and all other actions are intentionally excluded.
    throw new Error("This action cannot be saved offline.");
  }
}
function checkActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Offline sync cancelled", "AbortError");
}
function sameMutation(a: OfflineMutation, b: OfflineMutation): boolean {
  if (a.id !== b.id || a.accountId !== b.accountId || a.conversationId !== b.conversationId || a.messageId !== b.messageId
      || a.createdAt !== b.createdAt || a.expectedRevision !== b.expectedRevision || a.kind !== b.kind) return false;
  if (a.kind === "edit" && b.kind === "edit") return a.text === b.text;
  if (a.kind === "reaction" && b.kind === "reaction") return a.reaction === b.reaction;
  return a.kind === "delete" && b.kind === "delete";
}

function validateReceipt(mutation: OfflineMutation, result: AuthoritativeResult): void {
  if (!result || typeof result !== "object" || result.messageId !== mutation.messageId || result.conversationId !== mutation.conversationId
      || result.kind !== mutation.kind || typeof result.revision !== "string" || !result.revision || result.revision.length > 1024) {
    throw new Error("Invalid offline server receipt.");
  }
  if (result.kind === "edit" && (typeof result.text !== "string" || !result.text.trim() || result.text.length > MAX_TEXT_LENGTH
      || typeof result.editedAt !== "string" || !result.editedAt || result.editedAt.length > 128 || !Number.isFinite(Date.parse(result.editedAt))
      || mutation.kind !== "edit" || result.text !== mutation.text)) throw new Error("Invalid offline server receipt.");
  if (result.kind === "reaction" && ((result.reaction !== null && !isReactionType(result.reaction))
      || mutation.kind !== "reaction" || result.reaction !== mutation.reaction)) throw new Error("Invalid offline server receipt.");
}

function lane(mutation: OfflineMutation): string {
  return `${mutation.messageId}:${mutation.kind === "reaction" ? "reaction" : "content"}`;
}

async function readState(store: OfflineQueueStore, session: OfflineSession): Promise<QueueState> {
  if (!validId(session.accountId) || !validId(session.generation)) throw new Error("Invalid offline session.");
  const state = await store.read(session);
  if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.entries) || state.entries.length > MAX_QUEUE) {
    throw new Error("Offline queue is invalid.");
  }
  const ids = new Set<string>();
  const lanes = new Set<string>();
  for (const entry of state.entries) {
    if (!entry || !["pending", "inflight", "conflict"].includes(entry.status)) throw new Error("Offline queue is invalid.");
    validateOfflineMutation(session, entry.mutation);
    if (ids.has(entry.mutation.id) || lanes.has(lane(entry.mutation))) throw new Error("Offline queue is invalid.");
    ids.add(entry.mutation.id); lanes.add(lane(entry.mutation));
  }
  return state;
}

/** Add a durable pending operation without overwriting concurrent work. */
export async function enqueueOfflineMutation(store: OfflineQueueStore, session: OfflineSession, mutation: OfflineMutation): Promise<void> {
  validateOfflineMutation(session, mutation);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const state = await readState(store, session);
    const existing = state.entries.find((entry) => entry.mutation.id === mutation.id);
    if (existing) {
      if (!sameMutation(existing.mutation, mutation)) throw new Error("An offline operation id was reused.");
      return;
    }
    if (mutation.kind === "reaction" && state.entries.some((entry) => entry.mutation.messageId === mutation.messageId && entry.mutation.kind === "delete")) {
      throw new Error("A deleted message cannot be reacted to offline.");
    }
    const index = state.entries.findIndex((entry) => lane(entry.mutation) === lane(mutation));
    let entries: QueueEntry[];
    if (index >= 0) {
      const previous = state.entries[index];
      // Only coalesce before an operation could have reached the server. The
      // CAS makes this race-safe with the transition from pending to inflight.
      if (previous.status !== "pending") throw new Error("A change to this message is already syncing or needs attention.");
      if (previous.mutation.expectedRevision !== mutation.expectedRevision) throw new Error("The original message revision changed.");
      if (previous.mutation.kind === "delete" && mutation.kind !== "delete") throw new Error("A deleted message cannot be edited offline.");
      if (mutation.kind === "delete" && previous.mutation.kind !== "delete") {
        // A reaction queued after the old edit must run before the deletion.
        entries = [...state.entries.filter((_, i) => i !== index), { mutation: { ...mutation }, status: "pending" }];
      } else {
        entries = state.entries.map((entry, i) => i === index ? { mutation: { ...mutation }, status: "pending" } : entry);
      }
    } else {
      if (state.entries.length >= MAX_QUEUE) throw new Error("Too many pending changes. Connect to sync them first.");
      entries = [...state.entries, { mutation: { ...mutation }, status: "pending" }];
    }
    if (await store.compareAndSwap(session, state.revision, entries)) return;
  }
  throw new Error("Couldn't safely save the offline change. Try again.");
}

/**
 * Replay in creation order. A conflict is durable and stops replay until the
 * user resolves it. Network failures leave an inflight item pending, including
 * after process death; retries send exactly the same id and payload. A server
 * confirmation alone is not enough: it is removed only after the native store
 * atomically applies the authoritative result to the encrypted snapshot.
 */
export async function syncOfflineMutations(
  store: OfflineQueueStore,
  server: OfflineMutationServer,
  session: OfflineSession,
  signal: AbortSignal
): Promise<{ confirmed: number; pending: number; blocked: "conflict" | "network" | null }> {
  let confirmed = 0;
  while (true) {
    checkActive(signal);
    let state = await readState(store, session);
    checkActive(signal);
    const entry = state.entries[0];
    if (!entry) return { confirmed, pending: 0, blocked: null };
    validateOfflineMutation(session, entry.mutation);
    if (entry.status === "conflict") return { confirmed, pending: state.entries.length, blocked: "conflict" };
    if (entry.status === "pending") {
      const next = state.entries.map((item, index) => index === 0 ? { ...item, status: "inflight" as const } : item);
      if (!await store.compareAndSwap(session, state.revision, next)) continue;
      state = await readState(store, session);
      checkActive(signal);
      if (!state.entries[0] || !sameMutation(state.entries[0].mutation, entry.mutation) || state.entries[0].status !== "inflight") continue;
    }
    let outcome: ServerOutcome;
    try { outcome = await server.apply(session, entry.mutation, signal); }
    catch {
      checkActive(signal);
      const latest = await readState(store, session);
      return { confirmed, pending: latest.entries.length, blocked: "network" };
    }
    checkActive(signal);
    if (!outcome || (outcome.status !== "confirmed" && outcome.status !== "conflict")) throw new Error("Invalid offline server receipt.");
    if (outcome.status === "confirmed") validateReceipt(entry.mutation, outcome.authoritative);
    let written = false;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      checkActive(signal);
      const latest = await readState(store, session);
      const current = latest.entries[0];
      // Another worker might already have durably acknowledged this operation.
      if (!current || !sameMutation(current.mutation, entry.mutation)) { written = true; break; }
      if (outcome.status === "conflict") {
        if (current.status === "conflict") { written = true; break; }
        written = await store.compareAndSwap(session, latest.revision, [{ ...current, status: "conflict" }, ...latest.entries.slice(1)]);
      } else {
        written = await store.acknowledge(session, latest.revision, entry.mutation, outcome.authoritative);
      }
      if (written) break;
    }
    if (!written) throw new Error("Couldn't safely save the sync result. The change remains pending.");
    if (outcome.status === "conflict") {
      const latest = await readState(store, session);
      return { confirmed, pending: latest.entries.length, blocked: "conflict" };
    }
    confirmed++;
  }
}
