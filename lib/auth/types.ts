export type Account = {
  id: string;
  email: string;
  username: string | null;
  avatarId: string | null;
  /** uploaded photo (Supabase Storage URL), when the person has one */
  avatarUrl: string | null;
  /** true once the user has a username — mid-onboarding otherwise. */
  profileComplete: boolean;
  /** true when an app-lock password exists for this account. */
  hasAppLock: boolean;
  /** private accounts stay out of search — only an exact handle finds them. */
  isPrivate: boolean;
};

export type SendOtpResult = {
  /** Only present in local/demo mode: surfaced in the UI so the flow is testable. */
  devCode?: string;
  cooldownSeconds: number;
};

export type AuthError = { code: AuthErrorCode; message: string };

export type AuthErrorCode =
  | "INVALID_EMAIL"
  | "INVALID_CODE"
  | "CODE_EXPIRED"
  | "TOO_MANY_ATTEMPTS"
  | "ACCOUNT_EXISTS"
  | "ACCOUNT_NOT_FOUND"
  | "WRONG_PASSWORD"
  | "EMAIL_CONFIRMATION"
  | "USERNAME_TAKEN"
  | "USERNAME_RESERVED"
  | "WEAK_PASSWORD"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_EMAIL: "That email doesn't look right. Mind checking it?",
  INVALID_CODE: "That code isn't quite right. Try again.",
  CODE_EXPIRED: "This code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many tries. Send a fresh code.",
  ACCOUNT_EXISTS: "This email already has an account. Sign in instead.",
  ACCOUNT_NOT_FOUND: "We couldn't find an account with that email.",
  WRONG_PASSWORD: "That password doesn't match. Try again.",
  EMAIL_CONFIRMATION:
    "This project still asks for email confirmation. Use sign in, or ask the owner to turn it off.",
  USERNAME_TAKEN: "That one's taken. Try another.",
  USERNAME_RESERVED: "That handle is reserved. Pick another.",
  WEAK_PASSWORD: "Use at least 8 characters, with a letter and a number.",
  RATE_LIMITED: "Slow down a moment, then try again.",
  NETWORK: "Can't reach the server. Check your connection.",
  UNKNOWN: "Something went wrong. Try again?",
};

export class AuthFailure extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? AUTH_ERROR_MESSAGES[code]);
    this.code = code;
    this.name = "AuthFailure";
  }
}

export interface AuthProvider {
  mode: "supabase" | "local";
  getAccount(): Promise<Account | null>;
  /** Create an account straight from email + password (no inbox needed). */
  signUpWithPassword(email: string, password: string): Promise<void>;
  sendOtp(email: string): Promise<SendOtpResult>;
  verifyOtp(email: string, code: string): Promise<void>;
  createPassword(password: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  isUsernameAvailable(username: string): Promise<boolean>;
  saveProfile(input: { username: string; avatarId: string | null }): Promise<Account>;
  /** uploaded profile photo — null removes it */
  setAvatar(url: string | null): Promise<Account>;
  updateUsername(username: string): Promise<Account>;
  setAppLock(password: string | null): Promise<void>;
  verifyAppLock(password: string): Promise<boolean>;
  hasAppLock(): Promise<boolean>;
  /** verify the account's own password (account deletion gate). */
  verifyPassword(password: string): Promise<boolean>;
  /** hide the account from search — only an exact handle finds it. */
  setPrivate(isPrivate: boolean): Promise<Account>;
  /** irreversible: wipe the profile and this account's data, then sign out. */
  deleteAccount(): Promise<void>;
}

export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "support", "help", "dolemon", "system", "root", "mod",
  "moderator", "staff", "official", "team", "api", "me", "you", "settings", "app",
  "signin", "signup", "login", "about", "privacy", "terms", "chat", "messages",
]);

export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;
