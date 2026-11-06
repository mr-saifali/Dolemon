/** Simple lexical cues, not a determination of truth, deception, or intent. */
export function compareStatements(a: string, b: string): { shared: string[]; firstNumbers: string[]; secondNumbers: string[]; negationDiffers: boolean } {
  const words = (s: string) => s.toLowerCase().match(new RegExp("[\\p{L}\\p{M}\\p{N}]+", "gu")) ?? [];
  const excluded = new Set(["the", "and", "you", "your", "that", "this", "was", "are", "have", "for", "with", "not", "nahi", "nahin", "theek"]);
  const first = words(a), second = words(b);
  const secondSet = new Set(second);
  const shared = Array.from(new Set(first.filter((word) => word.length > 2 && !excluded.has(word) && secondSet.has(word)))).slice(0, 8);
  const numbers = (s: string) => Array.from(new Set(s.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [])).slice(0, 8);
  const negative = (s: string) => /\b(?:no|not|never|nahi|nahin|nhi|never|didn't|dont|don't|can't|cannot)\b/i.test(s);
  return { shared, firstNumbers: numbers(a), secondNumbers: numbers(b), negationDiffers: negative(a) !== negative(b) };
}
