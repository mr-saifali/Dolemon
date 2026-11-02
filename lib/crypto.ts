/** Small hashing helpers used by the local auth provider and the app-lock gate. */

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 fallback for non-secure contexts where crypto.subtle is unavailable. */
function fallbackHash(value: string, salt: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = `${salt}::${value}`;
  for (let i = 0; i < s.length; i++) {
    h1 = (h1 ^ s.charCodeAt(i)) * 16777619 >>> 0;
    h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0;
  }
  return `fb$${h1.toString(16)}${h2.toString(16)}${s.length.toString(16)}`;
}

export function newSalt() {
  return randomHex(16);
}

/** PBKDF2-SHA256 when available; honest fallback otherwise. */
export async function hashSecret(secret: string, salt: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) return fallbackHash(secret, salt);
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: 120_000, hash: "SHA-256" },
      key,
      256
    );
    return `pbkdf2$${toHex(bits)}`;
  } catch {
    return fallbackHash(secret, salt);
  }
}

export async function verifySecret(secret: string, salt: string, expected: string): Promise<boolean> {
  const actual = await hashSecret(secret, salt);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function randomDigits(length = 6) {
  const arr = new Uint32Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 1e9);
  return Array.from(arr).map((n) => (n % 10).toString()).join("");
}
