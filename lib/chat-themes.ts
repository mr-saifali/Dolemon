export const CHAT_THEMES = [
  { id: "soft-glow", name: "Soft glow", description: "The Dolemon classic", image: null, bubble: "#673344", outline: "rgba(255, 191, 208, .35)" },
  { id: "open-sky", name: "Open sky", description: "A little room to breathe", image: "/chat-themes/open-sky.jpg", bubble: "#1e4c65", outline: "rgba(185, 223, 245, .4)" },
  { id: "wild-coast", name: "Wild coast", description: "Meet the open sea", image: "/chat-themes/wild-coast.jpg", bubble: "#205249", outline: "rgba(174, 223, 210, .4)" },
  { id: "golden-road", name: "Golden road", description: "Go wherever you feel", image: "/chat-themes/golden-road.jpg", bubble: "#60442f", outline: "rgba(242, 213, 170, .4)" },
  { id: "sky-garden", name: "Sky garden", description: "Float beyond the clouds", image: "/chat-themes/sky-garden.jpg", bubble: "#48436e", outline: "rgba(215, 205, 248, .4)" },
  { id: "aurora-dream", name: "Aurora dream", description: "Follow the northern lights", image: "/chat-themes/aurora-dream.jpg", bubble: "#254e55", outline: "rgba(174, 229, 224, .4)" },
  { id: "endless-horizon", name: "Endless horizon", description: "A world without limits", image: "/chat-themes/endless-horizon.jpg", bubble: "#34466b", outline: "rgba(193, 210, 246, .4)" },
] as const;

export type ChatThemeId = (typeof CHAT_THEMES)[number]["id"];
export const DEFAULT_CHAT_THEME: ChatThemeId = "soft-glow";

/** Local storage can outlive a theme release; unknown values safely use the classic. */
export function getChatTheme(id: unknown) {
  return CHAT_THEMES.find((theme) => theme.id === id) ?? CHAT_THEMES[0];
}

export function isChatThemeId(id: unknown): id is ChatThemeId {
  return CHAT_THEMES.some((theme) => theme.id === id);
}

export function resolveChatTheme(override: unknown, fallback: unknown) {
  return getChatTheme(isChatThemeId(override) ? override : fallback);
}
