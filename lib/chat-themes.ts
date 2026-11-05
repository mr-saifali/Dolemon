export const CHAT_THEMES = [
  { id: "soft-glow", name: "Soft glow", description: "The Dolemon classic", image: null },
  { id: "open-sky", name: "Open sky", description: "A little room to breathe", image: "/chat-themes/open-sky.jpg" },
  { id: "wild-coast", name: "Wild coast", description: "Meet the open sea", image: "/chat-themes/wild-coast.jpg" },
  { id: "golden-road", name: "Golden road", description: "Go wherever you feel", image: "/chat-themes/golden-road.jpg" },
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
