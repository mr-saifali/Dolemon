/**
 * Honest status when the remote (Gemini) brain is down — a clear signal,
 * NOT a canned "demo answer". With a real backend configured, Doremon says
 * plainly that he can't answer right now instead of parroting scripted
 * demo lines (which read as the same fake reply over and over).
 *
 * The pocket/local brain is still used for true demo mode (no backend at
 * all) and for SILENT memory bookkeeping — just never as a fake chat
 * answer in remote mode.
 */
export const OFFLINE_NOTICE =
  "Arre Nobita, abhi Gemini se jawab nahi mil paaya. 🐱";

/** Also discard legacy notices from saved conversations after upgrading. */
export function isOfflineNotice(text: string): boolean {
  return text.startsWith(OFFLINE_NOTICE) || text.startsWith("Arre Nobita, abhi mera Gemini brain offline hai");
}

/**
 * Copilot-style transparency: turn the server's raw detail into a short
 * human reason, appended to the offline notice so the person knows WHY
 * (and whether it will recover on its own).
 */
export function offlineReason(detail: string | null | undefined, retryAfterSeconds?: number | null, quotaScope?: "day" | "minute" | "unknown"): string {
  if (!detail) return "";
  if (/AUTH_REQUIRED/i.test(detail)) return "session expire ho gayi — sign in karke phir try karo";
  if (/AUTH_UNAVAILABLE|AUTH_CONFIG/i.test(detail)) return "login verify nahi ho paaya — thodi der baad try karo";
  if (/MODEL_QUOTA/i.test(detail)) return "is model ke liye free quota available nahi hai — Google AI Studio mein model quota check karo";
  if (/quota|429|limit exceeded/i.test(detail)) {
    if (quotaScope === "day") return "Google ki daily request limit hit hui — daily quota midnight Pacific time par reset hota hai";
    const wait = retryAfterSeconds && retryAfterSeconds > 0
      ? `Google ke mutabik ${retryAfterSeconds} seconds baad phir try karo`
      : "thodi der baad phir try karo; daily quota khatam ho toh reset ka wait karo";
    return `${quotaScope === "minute" ? "Google ki per-minute limit hit hui" : "Google ki rate ya quota limit hit hui"} — ${wait}`;
  }
  if (/network/i.test(detail) && !/timeout/i.test(detail)) return "network se connection nahi ho paaya — internet check karke try karo";
  if (/timeout|no response in/i.test(detail)) return "server se response nahi mila — thodi der baad try karo";
  if (/503|high demand|unavailable/i.test(detail)) return "models overloaded hain";
  if (/404|not found/i.test(detail)) return "models abhi available nahi hain";
  if (/401|403|api key|BAD_KEY|NO_KEY/i.test(detail)) return "API key mein issue hai";
  return "Gemini se jawab nahi mila — thodi der baad phir try karo";
}
