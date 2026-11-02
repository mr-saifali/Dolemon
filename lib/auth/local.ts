import { hashSecret, newSalt, randomDigits, verifySecret } from "@/lib/crypto";
import { OTP_LENGTH } from "@/lib/otp";
import {
  AuthFailure,
  RESERVED_USERNAMES,
  USERNAME_PATTERN,
  type Account,
  type AuthProvider,
  type SendOtpResult,
} from "./types";

/**
 * Local stand-in for Supabase, used when no project keys are configured.
 * Everything lives in localStorage so the full onboarding flow is clickable
 * without a backend. Never ships to production as-is — see docs/supabase.md.
 */

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  username: string | null;
  avatarId: string | null;
  appLock?: { hash: string; salt: string } | null;
  createdAt: number;
};

type StoredOtp = { email: string; code: string; expiresAt: number; attempts: number; sentAt: number };
type StoredSession = { userId: string };

const K = {
  users: "dolemon:users",
  otp: "dolemon:otp",
  session: "dolemon:session",
  verified: "dolemon:verified-email",
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_S = 30;
const MAX_ATTEMPTS = 5;
const OTP_DEV_BYPASS = "1".repeat(OTP_LENGTH);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function remove(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function users(): Record<string, StoredUser> {
  return read<Record<string, StoredUser>>(K.users, {});
}

function saveUsers(next: Record<string, StoredUser>) {
  write(K.users, next);
}

function toAccount(u: StoredUser): Account {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    avatarId: u.avatarId,
    profileComplete: Boolean(u.username),
    hasAppLock: Boolean(u.appLock),
  };
}

function currentUser(): StoredUser | null {
  const session = read<StoredSession | null>(K.session, null);
  if (!session) return null;
  const all = users();
  return Object.values(all).find((u) => u.id === session.userId) ?? null;
}

function findUserByEmail(email: string): StoredUser | null {
  return users()[email.toLowerCase()] ?? null;
}

function requireUser(): StoredUser {
  const u = currentUser();
  if (!u) throw new AuthFailure("ACCOUNT_NOT_FOUND");
  return u;
}

export const localProvider: AuthProvider = {
  mode: "local",

  async getAccount() {
    const u = currentUser();
    return u ? toAccount(u) : null;
  },

  async sendOtp(email: string): Promise<SendOtpResult> {
    await sleep(450);
    const normalized = email.trim().toLowerCase();
    const existing = findUserByEmail(normalized);
    if (existing?.passwordHash) throw new AuthFailure("ACCOUNT_EXISTS");

    const prev = read<StoredOtp | null>(K.otp, null);
    if (prev && prev.email === normalized) {
      const since = (Date.now() - prev.sentAt) / 1000;
      if (since < OTP_COOLDOWN_S) {
        throw new AuthFailure(
          "RATE_LIMITED",
          "We just sent a code — give it a few seconds, or use the one you already have."
        );
      }
    }

    const code = randomDigits(OTP_LENGTH);
    write(K.otp, {
      email: normalized,
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      sentAt: Date.now(),
    } satisfies StoredOtp);
    remove(K.verified);

    return { devCode: code, cooldownSeconds: OTP_COOLDOWN_S };
  },

  async verifyOtp(email: string, code: string) {
    await sleep(400);
    const normalized = email.trim().toLowerCase();
    const otp = read<StoredOtp | null>(K.otp, null);
    if (!otp || otp.email !== normalized) throw new AuthFailure("CODE_EXPIRED");
    if (Date.now() > otp.expiresAt) throw new AuthFailure("CODE_EXPIRED");
    if (otp.attempts >= MAX_ATTEMPTS) throw new AuthFailure("TOO_MANY_ATTEMPTS");

    const cleaned = code.replace(/\D/g, "");
    if (cleaned !== otp.code && cleaned !== OTP_DEV_BYPASS) {
      write(K.otp, { ...otp, attempts: otp.attempts + 1 });
      throw new AuthFailure("INVALID_CODE");
    }

    write(K.verified, normalized);
    remove(K.otp);
  },

  async createPassword(password: string) {
    await sleep(500);
    const email = read<string | null>(K.verified, null);
    if (!email) throw new AuthFailure("UNKNOWN", "Verify your email again to continue.");
    if (password.length < 8) throw new AuthFailure("WEAK_PASSWORD");

    const all = users();
    const existing = all[email];
    const salt = newSalt();
    const passwordHash = await hashSecret(password, salt);

    const user: StoredUser = existing
      ? { ...existing, salt, passwordHash }
      : {
          id: `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
          email,
          passwordHash,
          salt,
          username: null,
          avatarId: null,
          appLock: null,
          createdAt: Date.now(),
        };

    all[email] = user;
    saveUsers(all);
    write(K.session, { userId: user.id } satisfies StoredSession);
  },

  async signInWithPassword(email: string, password: string) {
    await sleep(500);
    const user = findUserByEmail(email.trim().toLowerCase());
    if (!user) throw new AuthFailure("ACCOUNT_NOT_FOUND");
    const ok = await verifySecret(password, user.salt, user.passwordHash);
    if (!ok) throw new AuthFailure("WRONG_PASSWORD");
    write(K.session, { userId: user.id } satisfies StoredSession);
  },

  async signOut() {
    await sleep(120);
    remove(K.session);
    remove(K.verified);
    if (typeof window !== "undefined") window.sessionStorage.removeItem("dolemon:app-unlocked");
  },

  async isUsernameAvailable(username: string) {
    await sleep(320);
    const value = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(value)) return false;
    if (RESERVED_USERNAMES.has(value)) return false;
    const me = currentUser();
    return !Object.values(users()).some(
      (u) => u.username?.toLowerCase() === value && u.id !== me?.id
    );
  },

  async saveProfile({ username, avatarId }) {
    await sleep(450);
    const me = requireUser();
    const value = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(value)) throw new AuthFailure("USERNAME_TAKEN");
    if (RESERVED_USERNAMES.has(value)) throw new AuthFailure("USERNAME_RESERVED");

    const all = users();
    const taken = Object.values(all).some(
      (u) => u.username?.toLowerCase() === value && u.id !== me.id
    );
    if (taken) throw new AuthFailure("USERNAME_TAKEN");

    all[me.email] = { ...me, username: value, avatarId };
    saveUsers(all);
    return toAccount(all[me.email]);
  },

  async updateUsername(username) {
    const me = requireUser();
    return localProvider.saveProfile({ username, avatarId: me.avatarId });
  },

  async setAppLock(password) {
    await sleep(350);
    const me = requireUser();
    const all = users();
    if (!password) {
      all[me.email] = { ...me, appLock: null };
      saveUsers(all);
      return;
    }
    const salt = newSalt();
    const hash = await hashSecret(password, salt);
    all[me.email] = { ...me, appLock: { hash, salt } };
    saveUsers(all);
  },

  async verifyAppLock(password) {
    const me = currentUser();
    if (!me?.appLock) return true;
    return verifySecret(password, me.appLock.salt, me.appLock.hash);
  },

  async hasAppLock() {
    return Boolean(currentUser()?.appLock);
  },
};
