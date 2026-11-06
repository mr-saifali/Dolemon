export type LinkPart = { type: "text" | "link"; value: string };

/** Recognize web URLs only, leaving trailing sentence punctuation outside. */
export function splitLinks(text: string): LinkPart[] {
  const result: LinkPart[] = [];
  const pattern = /https?:\/\/[^\s<>"\u0000-\u001f]+/gi;
  let last = 0;
  for (const match of Array.from(text.matchAll(pattern))) {
    const start = match.index ?? 0;
    let url = match[0];
    while (/[.,!?;:]$/.test(url) || (url.endsWith(")") && (url.match(/\)/g) ?? []).length > (url.match(/\(/g) ?? []).length)) url = url.slice(0, -1);
    try {
      const parsed = new URL(url);
      if (!url || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) continue;
    } catch { continue; }
    if (start > last) result.push({ type: "text", value: text.slice(last, start) });
    result.push({ type: "link", value: url });
    last = start + url.length;
  }
  if (last < text.length) result.push({ type: "text", value: text.slice(last) });
  return result;
}

/** Only public, directly embeddable Instagram URLs; never embed arbitrary hosts. */
export function instagramEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(u.hostname.toLowerCase()) || u.username || u.password || u.port) return null;
    const match = u.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]{3,32})\/?$/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1] === "reels" ? "reel" : match[1]}/${match[2]}/embed/`;
  } catch { return null; }
}
