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
  "Arre Nobita, abhi mera Gemini brain offline hai, isliye yeh jawab abhi nahi de sakta. Thodi der baad phir poochhna. 🐱";

/**
 * Copilot-style transparency: turn the server's raw detail into a short
 * human reason, appended to the offline notice so the person knows WHY
 * (and whether it will recover on its own).
 */
export function offlineReason(detail: string | null | undefined, retryAfterSeconds?: number | null): string {
  if (!detail) return "";
  if (/quota|429|limit exceeded/i.test(detail)) {
    const wait = retryAfterSeconds && retryAfterSeconds > 0
      ? `Google ke mutabik ${retryAfterSeconds} seconds baad phir try karo`
      : "thodi der baad phir try karo; daily quota khatam ho toh reset ka wait karo";
    return `free-tier rate ya quota limit hit hui — ${wait}`;
  }
  if (/timeout|no response in/i.test(detail)) return "server se response nahi mila — thodi der baad try karo";
  if (/503|high demand|unavailable/i.test(detail)) return "models overloaded hain";
  if (/404|not found/i.test(detail)) return "models abhi available nahi hain";
  if (/401|403|api key|BAD_KEY|NO_KEY/i.test(detail)) return "API key mein issue hai";
  return "";
}
