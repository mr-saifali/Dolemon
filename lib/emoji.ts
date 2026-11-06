/** True only when every non-whitespace character belongs to an emoji sequence.
 * Includes skin tones, ZWJ families, flags and keycaps, but not bare digits. */
const EMOJI_ONLY = new RegExp("^(?:(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator}|[0-9#*]\\uFE0F?\\u20E3)(?:\\uFE0F|\\p{Emoji_Modifier}|\\u200D|[\\u{E0020}-\\u{E007F}])*\\s*)+$", "u");
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && EMOJI_ONLY.test(trimmed);
}
