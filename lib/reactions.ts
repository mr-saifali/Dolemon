/**
 * Reactions are Dolemon's own five faces — not unicode emoji.
 *
 * One reaction per person per message (picking a new one replaces the old), which is what
 * keeps a two-person thread feeling like a note being underlined, not a scoreboard.
 */

export const REACTION_TYPES = ["dil", "haha", "wow", "aww", "hype"] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

/** Reactions are only ever cast by the two people in the thread. */
export type ReactionBy = "me" | "them";

export type MessageReaction = {
  type: ReactionType;
  by: ReactionBy;
  /** epoch ms — used for realtime ordering and for "just now" tooltips */
  at?: number;
};

type ReactionMeta = {
  /** short name, used in tooltips and a11y labels */
  label: string;
  /** what the sender means by it — shown as helper text in the picker */
  means: string;
};

export const REACTION_META: Record<ReactionType, ReactionMeta> = {
  dil: { label: "Dil", means: "I feel this" },
  haha: { label: "Haha", means: "that got me" },
  wow: { label: "Wow", means: "no way" },
  aww: { label: "Aww", means: "that's so sweet" },
  hype: { label: "Hype", means: "let's go" },
};

export function reactionLabel(type: ReactionType) {
  return REACTION_META[type].label;
}

export function isReactionType(value: unknown): value is ReactionType {
  return typeof value === "string" && (REACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Apply one tap of a reaction.
 *
 * - same type, same author → removes it (tap again to take it back)
 * - different type, same author → replaces it (one per person per message)
 */
export function toggleReaction(
  list: MessageReaction[] | undefined,
  type: ReactionType,
  by: ReactionBy
): MessageReaction[] {
  const current = list ?? [];
  const mine = current.find((r) => r.by === by);
  if (mine && mine.type === type) return current.filter((r) => r.by !== by);
  return [...current.filter((r) => r.by !== by), { type, by, at: Date.now() }];
}

export type ReactionChipData = {
  type: ReactionType;
  count: number;
  /** did *I* cast this one — drives the rose highlight */
  mine: boolean;
  /** only the partner cast it — tapping shows "Aarav ne Dil kiya" */
  partnerOnly: boolean;
};

/** Collapse raw reactions into chips, in a stable order (picker order, mine first). */
export function reactionChips(list: MessageReaction[] | undefined): ReactionChipData[] {
  const current = list ?? [];
  const chips: ReactionChipData[] = [];

  for (const type of REACTION_TYPES) {
    const ofType = current.filter((r) => r.type === type);
    if (ofType.length === 0) continue;
    const mine = ofType.some((r) => r.by === "me");
    chips.push({ type, count: ofType.length, mine, partnerOnly: !mine });
  }

  return chips.sort((a, b) => Number(b.mine) - Number(a.mine));
}

/** "Aarav ne Dil kiya" */
export function reactionSentence(type: ReactionType, partnerName: string, count = 1) {
  const label = reactionLabel(type);
  if (count > 1) return `${partnerName} aur tum dono ne ${label} kiya`;
  return `${partnerName} ne ${label} kiya`;
}

/** The reaction double-tap always lands on. */
export const QUICK_REACTION: ReactionType = "dil";
