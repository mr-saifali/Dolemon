export type PasswordStrength = { score: 0 | 1 | 2 | 3; label: string; color: string };

export function passwordRules(pw: string) {
  return {
    length: pw.length >= 8,
    letter: /[a-zA-Z]/.test(pw),
    number: /\d/.test(pw),
    longest: pw.length <= 72,
  };
}

export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "", color: "#2C2C35" };
  const r = passwordRules(pw);
  const variety = [/[a-z]/, /[A-Z]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
  let score = 0;
  if (r.length) score += 1;
  if (r.letter && r.number) score += 1;
  if (pw.length >= 12 || variety >= 2) score += 1;

  if (score <= 1) return { score: 1, label: "A bit short", color: "#FF6B6B" };
  if (score === 2) return { score: 2, label: "Getting there", color: "#FBBF24" };
  return { score: 3, label: "Strong", color: "#4ADE80" };
}

export function isPasswordValid(pw: string) {
  const r = passwordRules(pw);
  return r.length && r.letter && r.number && r.longest;
}
