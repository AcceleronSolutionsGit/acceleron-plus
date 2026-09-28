// ═══════════════════════════════════════════════════════════════
// Outbound email — nodemailer, configured from SMTP_* env vars.
//
// Email is an enhancement, never a requirement: if SMTP is not
// configured the transport is a no-op and callers carry on. Nothing
// in the app should fail because a mail server is unreachable.
//
// Node-only. Do not import from proxy.ts or a client component.
// ═══════════════════════════════════════════════════════════════

import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export interface MailResult {
  sent: boolean;
  skipped?: "not_configured" | "no_recipients";
  error?: string;
}

const globalForMail = globalThis as unknown as { acceleronMailer?: Transporter | null };

/** True when enough SMTP settings are present to attempt delivery. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function getTransport(): Transporter | null {
  if (!isMailConfigured()) return null;
  if (globalForMail.acceleronMailer !== undefined) return globalForMail.acceleronMailer;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    globalForMail.acceleronMailer = transport;
    return transport;
  } catch (err) {
    console.error("[mail] Could not create SMTP transport:", err);
    globalForMail.acceleronMailer = null;
    return null;
  }
}

function fromAddress(): string {
  return (
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "Acceleron Plus <no-reply@acceleron.in>"
  );
}

/**
 * Send one message. Never throws — the result says what happened.
 * Callers should not await this on a request's critical path unless
 * they actually need the outcome.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const recipients = (Array.isArray(message.to) ? message.to : [message.to])
    .map((address) => address?.trim())
    .filter((address): address is string => Boolean(address) && address.includes("@"));

  if (recipients.length === 0) return { sent: false, skipped: "no_recipients" };

  const transport = getTransport();
  if (!transport) return { sent: false, skipped: "not_configured" };

  try {
    await transport.sendMail({
      from: fromAddress(),
      to: recipients.join(", "),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[mail] Send failed:", error);
    return { sent: false, error };
  }
}

// ─── Templating ────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface NotificationEmailInput {
  title: string;
  message: string;
  projectName?: string | null;
  projectCode?: string | null;
  actionUrl?: string | null;
  severity?: "info" | "warning" | "critical";
}

/** Plain-text + HTML bodies for a notification email. */
export function renderNotificationEmail(input: NotificationEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const link = input.actionUrl ? `${appUrl}${input.actionUrl}` : null;
  const projectLabel = [input.projectCode, input.projectName].filter(Boolean).join(" — ");

  const subject = projectLabel ? `[${input.projectCode ?? "Acceleron"}] ${input.title}` : input.title;

  const accent =
    input.severity === "critical" ? "#C62828" : input.severity === "warning" ? "#B26A00" : "#212F60";

  const text = [
    input.title,
    "",
    input.message,
    projectLabel ? `\nProject: ${projectLabel}` : "",
    link ? `\nOpen: ${link}` : "",
    "\n—\nAcceleron Plus",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F5F6F8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B2440">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #E6E8EE">
    <tr><td style="padding:24px 28px;border-left:4px solid ${accent};border-radius:12px 0 0 12px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6B7392">
        ${escapeHtml(projectLabel || "Acceleron Plus")}
      </p>
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.35;color:#212F60">${escapeHtml(input.title)}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3A4260;white-space:pre-line">${escapeHtml(input.message)}</p>
      ${
        link
          ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:#212F60;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px">Open in Acceleron Plus</a>`
          : ""
      }
    </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#8B92AB;text-align:center">
    You are receiving this because you are on the project team in Acceleron Plus.
  </p>
</body></html>`;

  return { subject, text, html };
}

// ─── One-time sign-in code ─────────────────────────────────────────

/**
 * Body for a sign-in code email. Deliberately plain: no tracking, no
 * action link, and an explicit note that nobody will ever ask for the
 * code — the two things that make code phishing work.
 */
export function renderOtpEmail(input: {
  code: string;
  fullName?: string | null;
  expiresInMinutes: number;
}): { subject: string; text: string; html: string } {
  const greeting = input.fullName ? `Hi ${input.fullName.split(" ")[0]},` : "Hi,";
  const spaced = input.code.split("").join(" ");

  const subject = `${input.code} is your Acceleron Plus sign-in code`;

  const text = [
    greeting,
    "",
    `Your sign-in code is ${input.code}`,
    "",
    `It expires in ${input.expiresInMinutes} minutes and can only be used once.`,
    "",
    "If you did not try to sign in, you can ignore this email — nobody can",
    "get in without the code. Acceleron staff will never ask you for it.",
    "",
    "—",
    "Acceleron Plus",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F5F6F8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B2440">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #E6E8EE">
    <tr><td style="padding:28px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6B7392">Acceleron Plus</p>
      <h1 style="margin:0 0 18px;font-size:18px;line-height:1.35;color:#212F60">${escapeHtml(greeting)} here is your sign-in code</h1>
      <p style="margin:0 0 8px;font-size:30px;font-weight:700;letter-spacing:.32em;color:#212F60;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeHtml(spaced)}</p>
      <p style="margin:0 0 20px;font-size:13px;color:#6B7392">Expires in ${input.expiresInMinutes} minutes. It can only be used once.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#3A4260">
        If you did not try to sign in, you can ignore this email — nobody can get in
        without the code. <strong>Acceleron staff will never ask you for it.</strong>
      </p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
