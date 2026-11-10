/**
 * Supabase's `mailer_otp_length` is project-level (default 8 on newer projects).
 * The UI reads the same value from env so the boxes always match the code that's sent.
 */
export const OTP_LENGTH = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_OTP_LENGTH ?? 8);
  return Number.isFinite(raw) && raw >= 4 && raw <= 10 && Number.isInteger(raw) ? raw : 8;
})();

export const OTP_LENGTH_LABEL = `${OTP_LENGTH}-digit`;
