import { confirmAction } from "../confirm-action";

/** Acknowledgement is local to this action; it does not verify the other person's consent. */
export async function confirmDoremonSharing(remote: boolean): Promise<boolean> {
  if (!remote) return true;
  return confirmAction(
    "This request sends your question, a small selection of loaded conversation text, a short saved note and up to three previous Doremon exchanges to the external AI service. Speaker labels replace account handles; messages can still contain personal information. Attachments, media URLs and the full chat archive are not uploaded. Ask the other person before sharing their messages. Paid API access does not itself guarantee privacy; your provider/account data policy applies. Answers can be wrong. New Doremon history stays unencrypted on this device. Nothing is sent automatically when this room opens."
  );
}

export function confirmDoremonAnalysis(): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(
    "Automatic analysis reads recent chat text on this device and saves a personal Doremon memory, including to your account when available. It continues until you turn it off. Please ask the other person for permission first. Turning it off does not delete existing memories.\n\nTurn on only if you have permission."
  );
}
