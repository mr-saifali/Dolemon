/**
 * Stored reaction IDs stay stable while the UI displays native Unicode emoji.
 *
 * One reaction per person per message (picking a new one replaces the old), which is what
 * keeps a two-person thread feeling like a note being underlined, not a scoreboard.
 */

export const REACTION_TYPES = ["dil", "haha", "wow", "aww", "hype", "smile", "grin", "joy", "loveeyes", "kiss", "blush", "cool", "thinking", "eyes", "sad", "cry", "sob", "angry", "rage", "fear", "sleep", "sick", "skull", "facepalm", "shrug", "thumbsup", "thumbsdown", "clap", "pray", "strong", "ok", "handshake", "party", "hundred", "check", "heartbreak", "sparkles"] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

/** Keep these mappings stable so existing reaction and sticker records still render. */
export const REACTION_EMOJI: Record<ReactionType, string> = {
  dil: "❤️", haha: "😂", wow: "😮", aww: "🥹", hype: "🔥",
  smile: "😊", grin: "😁", joy: "🤣", loveeyes: "😍", kiss: "😘", blush: "☺️", cool: "😎",
  thinking: "🤔", eyes: "👀", sad: "😔", cry: "😢", sob: "😭", angry: "😠", rage: "😡",
  fear: "😨", sleep: "😴", sick: "🤒", skull: "💀", facepalm: "🤦", shrug: "🤷",
  thumbsup: "👍", thumbsdown: "👎", clap: "👏", pray: "🙏", strong: "💪", ok: "👌",
  handshake: "🤝", party: "🎉", hundred: "💯", check: "✅", heartbreak: "💔", sparkles: "✨",
};

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
  smile: { label: "Smile", means: "happy" }, grin: { label: "Grin", means: "delighted" },
  joy: { label: "Rolling laughter", means: "hilarious" }, loveeyes: { label: "Love it", means: "adorable" },
  kiss: { label: "Kiss", means: "affection" }, blush: { label: "Blush", means: "sweet" },
  cool: { label: "Cool", means: "nice" }, thinking: { label: "Thinking", means: "considering it" },
  eyes: { label: "Eyes", means: "I'm listening" }, sad: { label: "Sad", means: "that hurts" },
  cry: { label: "Tearful", means: "feeling sad" }, sob: { label: "Crying", means: "overwhelmed" },
  angry: { label: "Angry", means: "upset" }, rage: { label: "Furious", means: "very upset" },
  fear: { label: "Worried", means: "concerned" }, sleep: { label: "Sleepy", means: "tired" },
  sick: { label: "Unwell", means: "not feeling well" }, skull: { label: "Skull", means: "I'm dead" },
  facepalm: { label: "Facepalm", means: "oh no" }, shrug: { label: "Shrug", means: "not sure" },
  thumbsup: { label: "Thumbs up", means: "yes" }, thumbsdown: { label: "Thumbs down", means: "no" },
  clap: { label: "Applause", means: "well done" }, pray: { label: "Thanks", means: "grateful" },
  strong: { label: "Strong", means: "you've got this" }, ok: { label: "Okay", means: "all good" },
  handshake: { label: "Handshake", means: "agreed" }, party: { label: "Celebrate", means: "congratulations" },
  hundred: { label: "Hundred", means: "absolutely" }, check: { label: "Done", means: "confirmed" },
  heartbreak: { label: "Broken heart", means: "heartbroken" }, sparkles: { label: "Sparkles", means: "special" },
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
