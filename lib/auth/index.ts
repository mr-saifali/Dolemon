import type { AuthProvider } from "./types";
import { localProvider } from "./local";
import { supabaseProvider } from "./supabase";

const hasSupabase =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const auth: AuthProvider = hasSupabase ? supabaseProvider : localProvider;

export const authMode = auth.mode;
export type { Account } from "./types";
