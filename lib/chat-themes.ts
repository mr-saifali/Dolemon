export const CHAT_THEMES = [
  { id: "soft-glow", name: "Default", description: "A dark rose and violet glow", image: null, bubble: "#673344", outline: "rgba(255, 191, 208, .35)" },
  { id: "midnight", name: "Midnight", description: "Deep blue and subtle grain", image: null, bubble: "#1c3658", outline: "rgba(255, 255, 255, .2)" },
  { id: "rosewater", name: "Rosewater", description: "Muted pink under a soft shadow", image: null, bubble: "#704051", outline: "rgba(255, 255, 255, .2)" },
  { id: "pattern", name: "Pattern", description: "Quiet dots on charcoal", image: null, bubble: "#454545", outline: "rgba(255, 255, 255, .2)" },
  { id: "solid", name: "Solid", description: "Simply black", image: null, bubble: "#343434", outline: "rgba(255, 255, 255, .2)" },
  { id: "custom", name: "Custom", description: "Your photo, only on this device", image: null, bubble: "#005c4b", outline: "rgba(255, 255, 255, .2)" },
  { id: "midnight-lake", name: "Midnight Lake", description: "Moonlight on a quiet alpine lake", image: "/chat-themes/midnight-lake.jpg", bubble: "#00253d", outline: "rgba(255, 255, 255, .2)", artwork: "night" },
  { id: "rose-clouds", name: "Rose Clouds", description: "Dreamy rose clouds at dusk", image: "/chat-themes/rose-clouds.jpg", bubble: "#3e1f28", outline: "rgba(255, 255, 255, .2)", artwork: "night" },
  { id: "ocean-lights", name: "Ocean Lights", description: "Bioluminescent deep blue", image: "/chat-themes/ocean-lights.jpg", bubble: "#00343d", outline: "rgba(255, 255, 255, .2)", artwork: "night" },
  { id: "sakura-rain", name: "Sakura Rain", description: "Blossoms in a gentle night rain", image: "/chat-themes/sakura-rain.jpg", bubble: "#40232e", outline: "rgba(255, 255, 255, .2)", artwork: "night" },
  { id: "firefly-forest", name: "Firefly Forest", description: "A quiet forest full of fireflies", image: "/chat-themes/firefly-forest.jpg", bubble: "#152d24", outline: "rgba(255, 255, 255, .2)", artwork: "night" },
  { id: "cosmic-drift", name: "Cosmic Drift", description: "A violet universe after dark", image: "/chat-themes/cosmic-drift.jpg", bubble: "#292142", outline: "rgba(255, 255, 255, .2)", artwork: "night" },
  { id: "cloud-castles", name: "Cloud Castles", description: "Floating castles in a rainbow sky", image: "/chat-themes/cloud-castles.jpg", bubble: "#51404a", outline: "rgba(255, 255, 255, .2)", light: true, artwork: "vivid" },
  { id: "glass-ocean", name: "Glass Ocean", description: "A brilliant underwater garden", image: "/chat-themes/glass-ocean.jpg", bubble: "#174449", outline: "rgba(255, 255, 255, .2)", light: true, artwork: "vivid" },
  { id: "sky-koi", name: "Sky Koi", description: "Stained-glass koi in the clouds", image: "/chat-themes/sky-koi.jpg", bubble: "#553a38", outline: "rgba(255, 255, 255, .2)", light: true, artwork: "vivid" },
  { id: "aurora-garden", name: "Aurora Garden", description: "A luminous garden of glass petals", image: "/chat-themes/aurora-garden.jpg", bubble: "#493847", outline: "rgba(255, 255, 255, .2)", light: true, artwork: "vivid" },
  { id: "dream-train", name: "Dream Train", description: "A celestial train through sunrise", image: "/chat-themes/dream-train.jpg", bubble: "#443e56", outline: "rgba(255, 255, 255, .2)", light: true, artwork: "vivid" },
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

/** Light themes use a contrast scrim so translucent incoming messages remain legible. */
export function isLightChatTheme(theme: ChatTheme): boolean {
  return "light" in theme && theme.light === true;
}

/** Bright artwork keeps its color; text gets a local contrast treatment instead. */
export function isVividChatTheme(theme: ChatTheme): boolean {
  return "artwork" in theme && theme.artwork === "vivid";
}
export function isNightArtwork(theme: ChatTheme): boolean {
  return "artwork" in theme && theme.artwork === "night";
}

export const FEATURED_CHAT_THEMES: ChatThemeId[] = ["soft-glow", "midnight", "rosewater", "pattern", "solid"];
export const VIVID_CHAT_THEMES = CHAT_THEMES.filter(isVividChatTheme);
export const NIGHT_CHAT_THEMES = CHAT_THEMES.filter(isNightArtwork);
export const LEGACY_CHAT_THEMES = CHAT_THEMES.filter((theme) => !FEATURED_CHAT_THEMES.includes(theme.id) && theme.id !== "custom" && !isVividChatTheme(theme) && !isNightArtwork(theme));
