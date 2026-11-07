/** Keep provider/model branding out of Doremon's own visible responses. */
export function displayDoremonText(text: string): string {
  return text.replace(/\bgemini\b/gi, "AI service");
}
