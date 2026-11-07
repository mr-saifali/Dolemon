/** Acknowledgement is local to this action; it does not verify the other person's consent. */
export function confirmDoremonSharing(remote: boolean): boolean {
  if (!remote) return true;
  if (typeof window === "undefined") return false;
  return window.confirm(
    "If the external AI service is used, it receives only generic request labels and, when relevant, partial message counts. Questions, message text and Doremon history are not sent to that service. New room history is stored unencrypted on this device; older saved history may remain in your account. The service may use and review submitted content to improve its products. Answers cannot use details it has not received and may be inaccurate. Please ask the other person before sharing information about your conversation.\n\nContinue only if you have permission."
  );
}

export function confirmDoremonAnalysis(): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(
    "Automatic analysis reads recent chat text on this device and saves a personal Doremon memory, including to your account when available. It continues until you turn it off. Please ask the other person for permission first. Turning it off does not delete existing memories.\n\nTurn on only if you have permission."
  );
}
