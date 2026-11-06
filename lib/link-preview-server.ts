import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";

const MAX_BYTES = 128 * 1024;

type Preview = { title: string; description: string; site: string };
export function validateWebUrl(raw: string): URL {
  if (raw.length > 2048) throw new Error("Invalid URL");
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || (url.port && url.port !== "80" && url.port !== "443") || isIP(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) throw new Error("Invalid URL");
  url.hash = "";
  return url;
}
export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

function clean(value: string | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|#39|#x27|#(\d+));/gi, (entity, number) => {
    const names: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&#x27;": "'", "&lt;": "<", "&gt;": ">" };
    const code = Number(number); return names[entity.toLowerCase()] ?? (code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "");
  }).replace(/\s+/g, " ").trim();
}
function metadata(html: string, host: string): Preview {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = new Map<string, string>();
  for (const tag of tags) {
    const attrs = new Map<string, string>();
    const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    for (const m of Array.from(tag.matchAll(pattern))) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]);
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
    if (key && !meta.has(key)) meta.set(key, attrs.get("content") ?? "");
  }
  return { title: clean(meta.get("og:title") ?? meta.get("twitter:title") ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]).slice(0, 160), description: clean(meta.get("og:description") ?? meta.get("description") ?? meta.get("twitter:description")).slice(0, 260), site: clean(meta.get("og:site_name") ?? host).slice(0, 80) };
}

/** Resolve and pin a public IP on every redirect to prevent SSRF and DNS rebinding. */
export async function fetchLinkPreview(raw: string, redirects = 0): Promise<Preview> {
  if (redirects > 3) throw new Error("Too many redirects");
  const url = validateWebUrl(raw);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS timeout")), 3000); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) throw new Error("Address not allowed");
  const address = addresses[0];
  const pinnedLookup = ((_host, _options, callback) => callback(null, address.address, address.family)) as LookupFunction;
  const result = await new Promise<{ status: number; location?: string; html: string }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.get(url, { lookup: pinnedLookup, family: address.family, headers: { "User-Agent": "DolemonLinkPreview/1.0", Accept: "text/html" }, timeout: 5000 }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400) { res.destroy(); resolve({ status, location, html: "" }); return; }
      if (status !== 200 || !/^text\/html\b/i.test(res.headers["content-type"] ?? "")) { res.destroy(); reject(new Error("Preview unavailable")); return; }
      const chunks: Buffer[] = []; let bytes = 0; let finished = false;
      const finish = () => { if (!finished) { finished = true; resolve({ status, html: Buffer.concat(chunks).toString("utf8") }); } };
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; chunks.push(chunk.subarray(0, Math.max(0, chunk.length - Math.max(0, bytes - MAX_BYTES)))); if (bytes >= MAX_BYTES) { finish(); res.destroy(); } });
      res.on("end", finish); res.on("error", (error) => { if (!finished) reject(error); });
    });
    req.on("timeout", () => req.destroy(new Error("Timeout"))); req.on("error", reject);
  });
  if (result.status >= 300 && result.status < 400 && result.location) return fetchLinkPreview(new URL(result.location, url).href, redirects + 1);
  return metadata(result.html, url.hostname);
}
