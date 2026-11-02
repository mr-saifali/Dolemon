import { getSupabase } from "@/lib/supabase";
import {
  AuthFailure,
  RESERVED_USERNAMES,
  USERNAME_PATTERN,
  type Account,
  type AuthProvider,
  type SendOtpResult,
} from "./types";

/**
 * Supabase implementation.
 * - Email OTP:  supabase.auth.signInWithOtp  ->  verifyOtp({ type: "email" })
 * - Password:   supabase.auth.updateUser({ password })
 * - Profile:    public.profiles (see docs/supabase.md for the schema + RLS)
 */

const OTP_COOLDOWN_S = 30;

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_id: string | null;
  app_lock_hash?: string | null;
  app_lock_salt?: string | null;
};

function client() {
  const c = getSupabase();
  if (!c) throw new AuthFailure("NETWORK", "Supabase isn't configured.");
  return c;
}

function mapError(message: string): AuthFailure {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists")) return new AuthFailure("ACCOUNT_EXISTS");
  if (m.includes("expired")) return new AuthFailure("CODE_EXPIRED");
  if (m.includes("invalid") || m.includes("token")) return new AuthFailure("INVALID_CODE");
  if (m.includes("rate") || m.includes("too many")) return new AuthFailure("RATE_LIMITED");
  if (m.includes("credentials") || m.includes("password")) return new AuthFailure("WRONG_PASSWORD");
  if (m.includes("fetch") || m.includes("network")) return new AuthFailure("NETWORK");
  return new AuthFailure("UNKNOWN", "Something went wrong. Try again?");
}

async function loadProfile(userId: string, email: string): Promise<Account> {
  const { data, error } = await client()
    .from("profiles")
    .select("id, username, avatar_id, app_lock_hash")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) throw mapError(error.message);
  return {
    id: userId,
    email,
    username: data?.username ?? null,
    avatarId: data?.avatar_id ?? null,
    profileComplete: Boolean(data?.username),
    hasAppLock: Boolean(data?.app_lock_hash),
  };
}

export const supabaseProvider: AuthProvider = {
  mode: "supabase",

  async getAccount() {
    const { data, error } = await client().auth.getUser();
    if (error || !data.user?.email) return null;
    return loadProfile(data.user.id, data.user.email);
  },

  async sendOtp(email): Promise<SendOtpResult> {
    const { error } = await client().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) throw mapError(error.message);
    return { cooldownSeconds: OTP_COOLDOWN_S };
  },

  async verifyOtp(email, code) {
    const { error } = await client().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\D/g, ""),
      type: "email",
    });
    if (error) throw mapError(error.message);
  },

  async createPassword(password) {
    const { error } = await client().auth.updateUser({ password });
    if (error) throw mapError(error.message);

    const { data } = await client().auth.getUser();
    if (data.user) {
      await client()
        .from("profiles")
        .upsert({ id: data.user.id, avatar_id: null }, { onConflict: "id", ignoreDuplicates: true });
    }
  },

  async signInWithPassword(email, password) {
    const { error } = await client().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw mapError(error.message);
  },

  async signOut() {
    await client().auth.signOut();
    if (typeof window !== "undefined") window.sessionStorage.removeItem("dolemon:app-unlocked");
  },

  async isUsernameAvailable(username) {
    const value = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(value)) return false;
    if (RESERVED_USERNAMES.has(value)) return false;

    const { data, error } = await client().rpc("username_available", { candidate: value });
    if (error) return false;
    return Boolean(data);
  },

  async saveProfile({ username, avatarId }) {
    const value = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(value)) throw new AuthFailure("USERNAME_TAKEN");
    if (RESERVED_USERNAMES.has(value)) throw new AuthFailure("USERNAME_RESERVED");

    const { data: auth } = await client().auth.getUser();
    if (!auth.user?.email) throw new AuthFailure("ACCOUNT_NOT_FOUND");

    const { error } = await client()
      .from("profiles")
      .upsert({ id: auth.user.id, username: value, avatar_id: avatarId }, { onConflict: "id" });
    if (error) {
      if (error.code === "23505") throw new AuthFailure("USERNAME_TAKEN");
      throw mapError(error.message);
    }
    return loadProfile(auth.user.id, auth.user.email);
  },

  async updateUsername(username) {
    const { data: auth } = await client().auth.getUser();
    if (!auth.user?.email) throw new AuthFailure("ACCOUNT_NOT_FOUND");
    const { data: current } = await client()
      .from("profiles")
      .select("avatar_id")
      .eq("id", auth.user.id)
      .maybeSingle<ProfileRow>();
    return supabaseProvider.saveProfile({ username, avatarId: current?.avatar_id ?? null });
  },

  async setAppLock(password) {
    const { data: auth } = await client().auth.getUser();
    if (!auth.user) throw new AuthFailure("ACCOUNT_NOT_FOUND");

    if (!password) {
      const { error } = await client()
        .from("profiles")
        .update({ app_lock_hash: null, app_lock_salt: null })
        .eq("id", auth.user.id);
      if (error) throw mapError(error.message);
      return;
    }

    // Hashing happens server-side via an RPC so the salt never has to travel.
    const { error } = await client().rpc("set_app_lock", { new_password: password });
    if (error) throw mapError(error.message);
  },

  async verifyAppLock(password) {
    const { data, error } = await client().rpc("verify_app_lock", { attempt: password });
    if (error) throw mapError(error.message);
    return Boolean(data);
  },

  async hasAppLock() {
    const { data: auth } = await client().auth.getUser();
    if (!auth.user) return false;
    const { data } = await client()
      .from("profiles")
      .select("app_lock_hash")
      .eq("id", auth.user.id)
      .maybeSingle<ProfileRow>();
    return Boolean(data?.app_lock_hash);
  },
};
