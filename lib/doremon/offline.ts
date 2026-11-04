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
  "Arre Nobita, abhi mera Gemini brain offline hai (quota ya network), isliye yeh jawab abhi nahi de sakta. Thodi der baad phir poochhna. 🐱";
