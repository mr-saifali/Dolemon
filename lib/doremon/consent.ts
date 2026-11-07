/** Acknowledgement is local to this action; it does not verify the other person's consent. */
export function confirmDoremonSharing(remote: boolean): boolean {
  if (!remote) return true;
  if (typeof window === "undefined") return false;
  return window.confirm(
    "This request sends your question, recent chat excerpts and relevant saved memory to Google Gemini for an AI response. The response may be inaccurate. Please ask the other person for permission before sharing their messages.\n\nContinue only if you have permission."
  );
}

export function confirmDoremonAnalysis(): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(
    "Automatic analysis reads recent chat text on this device and saves a personal Doremon memory, including to your account when available. It continues until you turn it off. Please ask the other person for permission first. Turning it off does not delete existing memories.\n\nTurn on only if you have permission."
  );
}
