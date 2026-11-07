export const CHAT_THEMES = [
  { id: "soft-glow", name: "Soft glow", description: "The Dolemon classic", image: null, bubble: "#673344", outline: "rgba(255, 191, 208, .35)" },
  { id: "open-sky", name: "Open sky", description: "A little room to breathe", image: "/chat-themes/open-sky.jpg", bubble: "#1e4c65", outline: "rgba(185, 223, 245, .4)" },
  { id: "wild-coast", name: "Wild coast", description: "Meet the open sea", image: "/chat-themes/wild-coast.jpg", bubble: "#205249", outline: "rgba(174, 223, 210, .4)" },
  { id: "golden-road", name: "Golden road", description: "Go wherever you feel", image: "/chat-themes/golden-road.jpg", bubble: "#60442f", outline: "rgba(242, 213, 170, .4)" },
  { id: "sky-garden", name: "Sky garden", description: "Float beyond the clouds", image: "/chat-themes/sky-garden.jpg", bubble: "#48436e", outline: "rgba(215, 205, 248, .4)" },
  { id: "aurora-dream", name: "Aurora dream", description: "Follow the northern lights", image: "/chat-themes/aurora-dream.jpg", bubble: "#254e55", outline: "rgba(174, 229, 224, .4)" },
  { id: "endless-horizon", name: "Endless horizon", description: "A world without limits", image: "/chat-themes/endless-horizon.jpg", bubble: "#34466b", outline: "rgba(193, 210, 246, .4)" },
  { id: "artist-open-sky", name: "Open air", description: "A sky full of possibility", image: "/chat-themes/artist-open-sky.jpg", bubble: "#5c3f52", outline: "rgba(244, 202, 220, .4)" },
  { id: "artist-wild-canvas", name: "Wild canvas", description: "Colour outside the lines", image: "/chat-themes/artist-wild-canvas.jpg", bubble: "#3a4f4b", outline: "rgba(190, 227, 216, .4)" },
  { id: "artist-moonlit-flight", name: "Moonlit flight", description: "Find your own horizon", image: "/chat-themes/artist-moonlit-flight.jpg", bubble: "#343d64", outline: "rgba(206, 210, 245, .4)" },
  { id: "glow-peach", name: "Peach glow", description: "A sunrise in the clouds", image: "/chat-themes/glow-peach.jpg", bubble: "#823b55", outline: "rgba(255, 232, 235, .65)", light: true },
  { id: "glow-aqua", name: "Aqua glow", description: "Sunlight on a quiet lagoon", image: "/chat-themes/glow-aqua.jpg", bubble: "#1c6264", outline: "rgba(219, 255, 250, .65)", light: true },
  { id: "glow-lilac", name: "Lilac glow", description: "A sky full of soft light", image: "/chat-themes/glow-lilac.jpg", bubble: "#61427d", outline: "rgba(241, 225, 255, .65)", light: true },
] as const;

export type ChatTheme = (typeof CHAT_THEMES)[number];
export type ChatThemeId = ChatTheme["id"];
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

/** Light themes keep their glow; contrast is provided by message surfaces instead. */
export function isLightChatTheme(theme: ChatTheme): boolean {
  return "light" in theme && theme.light === true;
}
