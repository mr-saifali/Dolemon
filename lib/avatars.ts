export type AvatarPreset = {
  id: string;
  emoji: string;
  ring: string;
  bg: string;
};

/** Emoji + soft tint presets instead of file uploads: no storage, no moderation, still personal. */
export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "rose", emoji: "🌹", ring: "#FF5C7A", bg: "rgba(255,92,122,0.16)" },
  { id: "moon", emoji: "🌙", ring: "#8B8BFF", bg: "rgba(139,139,255,0.16)" },
  { id: "peach", emoji: "🍑", ring: "#FFA07A", bg: "rgba(255,160,122,0.16)" },
  { id: "cloud", emoji: "☁️", ring: "#7DD3FC", bg: "rgba(125,211,252,0.16)" },
  { id: "spark", emoji: "✨", ring: "#FDE68A", bg: "rgba(253,230,138,0.16)" },
  { id: "cherry", emoji: "🍒", ring: "#FB7185", bg: "rgba(251,113,133,0.16)" },
  { id: "lily", emoji: "🪷", ring: "#F9A8D4", bg: "rgba(249,168,212,0.16)" },
  { id: "star", emoji: "⭐", ring: "#FBBF24", bg: "rgba(251,191,36,0.16)" },
];

export function avatarById(id: string | null | undefined): AvatarPreset | null {
  if (!id) return null;
  return AVATAR_PRESETS.find((a) => a.id === id) ?? null;
}
