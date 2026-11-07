/** Local-only keyword lookup over the currently loaded window, not a full index. */
export type SearchRow = { who: "me" | "them"; text: string; at: number };
const STOP = new Set("what did she he they we i say said tell about message messages chat conversation kal aaj kya kisne kaha kahi bola boli usne hum meri mera the and for with that this have you your me her him please doremon tha thi hai hain".split(" "));
export function localLookup(question: string, rows: SearchRow[]): string | null {
  if (!/\b(?:said|say|wrote|kaha|kahi|bola|boli|search|find|dhundo)\b/i.test(question)) return null;
  const terms = Array.from(new Set(question.toLowerCase().split(new RegExp("[^\\p{L}\\p{M}\\p{N}]+", "u")).filter((word) => word.length >= 3 && !STOP.has(word)))).slice(0, 6);
  if (!terms.length) return "Local search: ek specific keyword do. Sirf loaded messages search ho sakte hain; purani history is result mein nahi ho sakti.";
  const matches = rows.filter((row) => terms.some((term) => row.text.toLowerCase().includes(term))).slice(-4);
  if (!matches.length) return "Local search: loaded messages mein match nahi mila. Yeh poori history nahi hai, isliye purane messages mein match ho sakta hai.";
  // Codes and their originals exist only in this function; no message text or
  // mapping is sent to the external service.
  const codes = matches.map((m, index) => ({ code: `m${index + 1}`, original: m }));
  return `Local matches (loaded messages only; not a complete history):\n${codes.map(({code, original}) => `${code} · ${original.who === "me" ? "u1" : "u2"}: ${original.text.slice(0, 240)}`).join("\n")}`;
}
