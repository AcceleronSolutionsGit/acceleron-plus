import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { identityDb, describeSetupError } from "@/lib/db";
import { resendOtp } from "@/lib/otp";
import { findAuthUserById } from "@/lib/auth";
import { sendMail, renderOtpEmail, isMailConfigured } from "@/lib/mailer";
import { OTP_COOKIE, OTP_TTL_SECONDS, shouldRevealOtp, shouldEmailOtp } from "@/lib/auth-config";

export const runtime = "nodejs";

/**
 * Send a fresh code for the challenge already in progress.
 * The old code stops working immediately.
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const challengeId = cookieStore.get(OTP_COOKIE)?.value;

    if (!challengeId) {
      return NextResponse.json(
        { error: "Your sign-in request has expired. Please start again.", restart: true },
        { status: 400 }
      );
    }

    const result = await resendOtp(challengeId);

    if (!result.ok) {
      if (result.reason === "cooldown") {
        return NextResponse.json(
          {
            error: `Please wait ${result.retryAfterSeconds} second${
              result.retryAfterSeconds === 1 ? "" : "s"
            } before asking for another code.`,
            retryAfterSeconds: result.retryAfterSeconds,
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Your sign-in request has expired. Please start again.", restart: true },
        { status: 400 }
      );
    }

    const challenge = await identityDb("login_otp_challenges")
      .where("id", challengeId)
      .first<{ user_id: string; email: string } | undefined>();

    const row = challenge ? await findAuthUserById(challenge.user_id) : undefined;
    const reveal = shouldRevealOtp();
    let delivered = false;

    if (row && shouldEmailOtp() && isMailConfigured()) {
      const { subject, text, html } = renderOtpEmail({
        code: result.code,
        fullName: row.full_name,
        expiresInMinutes: Math.round(OTP_TTL_SECONDS / 60),
      });
      delivered = (await sendMail({ to: row.email, subject, text, html })).sent;
    }

    if (reveal) {
      console.log(`\n  🔑 New sign-in code for ${row?.email ?? "user"}: ${result.code}\n`);
    } else if (!delivered) {
      return NextResponse.json(
        { error: "We could not send your sign-in code. Please contact your administrator." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "A new code is on its way.",
      expiresInSeconds: OTP_TTL_SECONDS,
      emailSent: delivered,
      ...(reveal ? { devCode: result.code } : {}),
    });
  } catch (err) {
    console.error("[auth] Could not resend the sign-in code:", err);

    // A missing table or a bad credential is a setup problem, not a fault —
    // say which, instead of leaving a bare 500 in the console.
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
