import type { AuthProvider } from "./types";
import { localProvider } from "./local";
import { supabaseProvider } from "./supabase";

const hasSupabase =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** "supabase" | "demo" | unset (auto: Supabase when configured) */
const forcedMode = process.env.NEXT_PUBLIC_AUTH_MODE;

const OVERRIDE_KEY = "dolemon:auth-override";

export const isSupabaseConfigured = hasSupabase;

/** True when this build runs on the local provider (used for demo-only affordances). */
export const authMode: "supabase" | "local" =
  hasSupabase && forcedMode !== "demo" ? "supabase" : "local";

function overridden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(OVERRIDE_KEY) === "local";
  } catch {
    return false;
  }
}

function active(): AuthProvider {
  if (!hasSupabase) return localProvider;
  if (forcedMode === "demo") return localProvider;
  if (forcedMode === "supabase") return supabaseProvider;
  return overridden() ? localProvider : supabaseProvider;
}

/** Pin this browser to the local provider so a demo never depends on email delivery. */
export function useDemoMode() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OVERRIDE_KEY, "local");
}

export function clearDemoMode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OVERRIDE_KEY);
}

export function isDemoSession() {
  return !hasSupabase || forcedMode === "demo" || overridden();
}

/**
 * Explicit delegation rather than a module-level provider choice: the app can fall back to
 * the device-local provider without every screen having to know about it.
 */
export const auth: AuthProvider = {
  get mode() {
    return active().mode;
  },
  getAccount: () => active().getAccount(),
  sendOtp: (email) => active().sendOtp(email),
  verifyOtp: (email, code) => active().verifyOtp(email, code),
  createPassword: (password) => active().createPassword(password),
  signInWithPassword: (email, password) => active().signInWithPassword(email, password),
  signOut: () => active().signOut(),
  isUsernameAvailable: (username) => active().isUsernameAvailable(username),
  saveProfile: (input) => active().saveProfile(input),
  updateUsername: (username) => active().updateUsername(username),
  setAppLock: (password) => active().setAppLock(password),
  verifyAppLock: (password) => active().verifyAppLock(password),
  hasAppLock: () => active().hasAppLock(),
};

export type { Account } from "./types";
