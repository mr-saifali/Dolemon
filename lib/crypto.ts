/** Small hashing helpers used by the local auth provider and the app-lock gate. */

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto === "undefined" || !crypto.getRandomValues) throw new Error("Secure randomness is unavailable. Use HTTPS or localhost.");
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Legacy verification only: never use this for new passwords. */
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

/** New secrets always use PBKDF2. Never silently create a weak hash. */
export async function hashSecret(secret: string, salt: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("Secure cryptography is unavailable. Use HTTPS or localhost.");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 120_000, hash: "SHA-256" },
    key, 256
  );
  return `pbkdf2$${toHex(bits)}`;
}

export async function verifySecret(secret: string, salt: string, expected: string): Promise<boolean> {
  // Legacy weak hashes remain verifiable to avoid locking people out.
  // Replacing the password/app lock creates a strong PBKDF2 hash.
  const actual = expected.startsWith("fb$") ? fallbackHash(secret, salt) : await hashSecret(secret, salt);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function randomDigits(length = 6) {
  const arr = new Uint32Array(length);
  if (typeof crypto === "undefined" || !crypto.getRandomValues) throw new Error("Secure randomness is unavailable. Use HTTPS or localhost.");
  crypto.getRandomValues(arr);
  return Array.from(arr).map((n) => (n % 10).toString()).join("");
}
