import { getSupabase } from "@/lib/supabase";
import { getPrefs } from "@/lib/prefs";
import { clearChatMediaCache } from "@/lib/media-url";
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
  avatar_url?: string | null;
  app_lock_hash?: string | null;
  app_lock_salt?: string | null;
  visibility?: string | null;
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

/**
 * Loads the profile.
 *
 * IMPORTANT: the `visibility` column only exists after migration 004 has been
 * run, and it is fetched in its OWN best-effort query on purpose — a missing
 * column must never break login. While the migration is pending, every
 * account simply reads as public.
 */
async function loadProfile(userId: string, email: string): Promise<Account> {
  // Both queries fly in parallel — one network round-trip total, and the
  // visibility one failing (migration 004 pending) can never break login.
  const [main, vis] = await Promise.all([
    client()
      .from("profiles")
      .select("id, username, avatar_id, avatar_url, app_lock_hash")
      .eq("id", userId)
      .maybeSingle<ProfileRow>(),
    client()
      .from("profiles")
      .select("visibility")
      .eq("id", userId)
      .maybeSingle<{ visibility?: string | null }>(),
  ]);
  const { data, error } = main;

  if (error) throw mapError(error.message);

  if (!data) {
    // the signup trigger should have made this row — heal it if it ever misses
    await client()
      .from("profiles")
      .upsert({ id: userId, avatar_id: null }, { onConflict: "id", ignoreDuplicates: true })
      .then(() => undefined, () => undefined);
  }

  const visibility: string | null = vis.error ? null : vis.data?.visibility ?? null;

  return {
    id: userId,
    email,
    username: data?.username ?? null,
    avatarId: data?.avatar_id ?? null,
    avatarUrl: data?.avatar_url ?? null,
    profileComplete: Boolean(data?.username),
    hasAppLock: Boolean(data?.app_lock_hash),
    isPrivate: visibility === "private",
  };
}

export const supabaseProvider: AuthProvider = {
  mode: "supabase",

  async getAccount() {
    const { data, error } = await client().auth.getUser();
    if (error) {
      // Invalid/expired sessions are sign-outs; connectivity failures should
      // not erase the cached account and force the user through login.
      if (error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError") return null;
      throw error;
    }
    if (!data.user?.email) return null;

    // A valid session must never be thrown out by a one-off network hiccup —
    // retry once before giving up.
    let account: Account;
    try {
      account = await loadProfile(data.user.id, data.user.email);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 600));
      account = await loadProfile(data.user.id, data.user.email);
    }

    // "last seen" heartbeat, at most every five minutes per tab
    if (typeof window !== "undefined" && getPrefs().showPresence && document.visibilityState === "visible") {
      const key = `dolemon:seen:${data.user.id}`;
      const previous = Number(window.localStorage.getItem(key) ?? 0);
      if (Date.now() - previous > 5 * 60_000) {
        window.localStorage.setItem(key, String(Date.now()));
        void client()
          .rpc("touch_presence")
          .then(() => undefined, () => undefined);
      }
    }

    return account;
  },

  /**
   * Password signup. With "Confirm email" switched off on the project (which is how
   * Dolemon is configured) this returns a session immediately, so no inbox is needed.
   */
  async signUpWithPassword(email, password) {
    const clean = email.trim().toLowerCase();
    const { data, error } = await client().auth.signUp({ email: clean, password });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        // They already have an account — let them in if the password matches.
        const retry = await client().auth.signInWithPassword({ email: clean, password });
        if (retry.error) throw new AuthFailure("ACCOUNT_EXISTS");
        return;
      }
      throw mapError(error.message);
    }

    if (!data.session) {
      const retry = await client().auth.signInWithPassword({ email: clean, password });
      if (retry.error) throw new AuthFailure("EMAIL_CONFIRMATION");
    }
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
    // never let the next account on this device reuse signed media URLs
    clearChatMediaCache();
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

  async setAvatar(url) {
    const { data: auth } = await client().auth.getUser();
    if (!auth.user?.email) throw new AuthFailure("ACCOUNT_NOT_FOUND");

    const { error } = await client()
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", auth.user.id);
    if (error) throw mapError(error.message);

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

  async verifyPassword(password) {
    const { data } = await client().auth.getUser();
    if (!data.user?.email) return false;
    // a successful sign-in proves the password; the session is for the same user
    const { error } = await client().auth.signInWithPassword({
      email: data.user.email,
      password,
    });
    return !error;
  },

  async setPrivate(privateFlag) {
    const { data: auth } = await client().auth.getUser();
    if (!auth.user?.email) throw new AuthFailure("ACCOUNT_NOT_FOUND");
    const { error } = await client().rpc("set_account_visibility", {
      visibility: privateFlag ? "private" : "public",
    });
    if (error) throw mapError(error.message);
    // Older deployments may have a visibility RPC that succeeds without
    // changing the column. Never announce privacy without confirming it.
    const result = await client().from("profiles").select("visibility").eq("id", auth.user.id).maybeSingle<{ visibility: string }>();
    if (result.error || result.data?.visibility !== (privateFlag ? "private" : "public")) {
      throw new Error("Could not verify account visibility. The server may need migration 011.");
    }
    return loadProfile(auth.user.id, auth.user.email);
  },
};
