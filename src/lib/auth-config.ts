// ═══════════════════════════════════════════════════════════════
// Authentication mode switches.
//
// The app currently signs people in with a one-time code sent to
// their work email. The password machinery (scrypt hashing, the
// change-password screen, admin resets) is all still in place and
// switches back on with a single environment variable.
// ═══════════════════════════════════════════════════════════════

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
}

/** One-time codes are the primary sign-in method. */
export const OTP_ENABLED = flag("AUTH_OTP_ENABLED", true);

/**
 * When true, a password is required *in addition to* the code, and the
 * forced password-change screen applies again. Off for now — the code
 * alone signs you in.
 */
export const REQUIRE_PASSWORD = flag("AUTH_REQUIRE_PASSWORD", false);

/** The old password-only endpoint. Off unless explicitly re-enabled. */
export const PASSWORD_LOGIN_ENABLED = flag("AUTH_PASSWORD_LOGIN_ENABLED", false);

// ─── One-time code parameters ──────────────────────────────────────

export const OTP_LENGTH = 6;

/** How long a code stays valid. */
export const OTP_TTL_SECONDS = Number(process.env.AUTH_OTP_TTL_SECONDS ?? 300); // 5 minutes

/** Wrong guesses before the challenge is burned and a new code is needed. */
export const OTP_MAX_ATTEMPTS = Number(process.env.AUTH_OTP_MAX_ATTEMPTS ?? 5);

/** Minimum wait between resend requests, in seconds. */
export const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.AUTH_OTP_RESEND_COOLDOWN ?? 30);

/** Codes a single account may request within the window below. */
export const OTP_MAX_PER_WINDOW = Number(process.env.AUTH_OTP_MAX_PER_WINDOW ?? 6);
export const OTP_WINDOW_SECONDS = Number(process.env.AUTH_OTP_WINDOW_SECONDS ?? 900); // 15 minutes

/** Cookie holding the pending challenge id. */
export const OTP_COOKIE = "acceleron_otp";

/**
 * How the code reaches the user.
 *
 *   screen — shown on the sign-in page and printed to the terminal
 *   email  — emailed only
 *   both   — emailed and shown
 *
 * Defaults to "screen" in development (no mail server needed) and
 * "email" in production. Production can never use "screen": a visible
 * code would hand every account to anyone who knows an email address,
 * so the value is clamped below rather than trusted.
 */
export type OtpDelivery = "screen" | "email" | "both";

export function otpDelivery(): OtpDelivery {
  const isProduction = process.env.NODE_ENV === "production";
  const raw = (process.env.AUTH_OTP_DELIVERY ?? "").toLowerCase().trim();

  const requested: OtpDelivery =
    raw === "screen" || raw === "email" || raw === "both"
      ? (raw as OtpDelivery)
      : isProduction
        ? "email"
        : "screen";

  // Clamp: never put a code on screen in production, whatever is configured.
  if (isProduction && requested !== "email") {
    if (raw && raw !== "email") {
      console.warn(
        `[auth] AUTH_OTP_DELIVERY="${raw}" ignored in production — codes are emailed only.`
      );
    }
    return "email";
  }
  return requested;
}

/**
 * Whether to return the code in the API response so it can be shown
 * on screen.
 *
 * Two independent conditions, because leaking this in production would
 * hand every account to anyone who knows an email address:
 *   1. NODE_ENV must not be "production" — checked here and again at
 *      the point of use, and it cannot be overridden by any env var.
 *   2. The delivery mode must include the screen.
 */
export function shouldRevealOtp(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!flag("AUTH_OTP_DEV_REVEAL", true)) return false;
  return otpDelivery() !== "email";
}

/** Whether to attempt an email for this code. */
export function shouldEmailOtp(): boolean {
  return otpDelivery() !== "screen";
}
