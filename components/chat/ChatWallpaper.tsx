import type { CSSProperties } from "react";
import { isLightChatTheme, type ChatTheme } from "@/lib/chat-themes";

/** Keep bright themes bright: readability comes from the message surfaces. */
export function chatThemeStyle(theme: ChatTheme): CSSProperties {
  const light = isLightChatTheme(theme);
  return {
    "--message-outgoing": theme.bubble,
    "--message-outline": theme.outline,
    "--message-incoming": light ? "#35313e" : "rgba(0,0,0,.2)",
    "--chat-label-bg": light ? "rgba(255,255,255,.88)" : "rgba(255,255,255,.08)",
    "--chat-label-text": light ? "#34303d" : "#d4d4d8",
  } as CSSProperties;
}

export function ChatWallpaper({ theme }: { theme: ChatTheme }) {
  if (!theme.image) return null;
  const light = isLightChatTheme(theme);
  return <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: `url(${theme.image})` }}>
    {light ? <div className="absolute inset-0 bg-gradient-to-b from-[#34283d]/10 via-transparent to-[#34283d]/10" /> : <><div className="absolute inset-0 bg-[#09090B]/55" /><div className="absolute inset-0 bg-gradient-to-b from-[#09090B]/45 via-transparent to-[#09090B]/55" /></>}
  </div>;
}
