import { NextResponse } from "next/server";
import { projectDb, identityDb } from "@/lib/db";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const sweepToken = process.env.NOTIFICATION_SWEEP_TOKEN;

  // If no tokens configured in environment, allow (e.g. dev/local)
  if (!cronSecret && !sweepToken) return true;

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const headerSweepToken = req.headers.get("x-sweep-token");

  if (cronSecret && (bearerToken === cronSecret || headerSweepToken === cronSecret)) {
    return true;
  }
  if (sweepToken && (bearerToken === sweepToken || headerSweepToken === sweepToken)) {
    return true;
  }

  return false;
}

async function handleTimesheetReminders(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 1. Get today's date in IST (yyyy-mm-dd format)
    const now = new Date();
    const todayIST = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now);

    // 2. Find all users allocated to active / non-closed projects
    const activeAllocations = await projectDb("project_team_members")
      .join("projects", "project_team_members.project_id", "projects.id")
      .where("project_team_members.is_active", true)
      .whereNotIn("projects.status", ["closed", "cancelled", "scrapped"])
      .select(
        "project_team_members.user_id",
        "projects.code as project_code",
        "projects.name as project_name"
      );

    if (activeAllocations.length === 0) {
      return NextResponse.json({ success: true, message: "No active project allocations found.", count: 0 });
    }

    // Map allocated projects per user
    const userProjectsMap: Record<string, Array<{ code: string; name: string }>> = {};
    for (const alloc of activeAllocations) {
      if (!userProjectsMap[alloc.user_id]) {
        userProjectsMap[alloc.user_id] = [];
      }
      if (!userProjectsMap[alloc.user_id].some((p) => p.code === alloc.project_code)) {
        userProjectsMap[alloc.user_id].push({
          code: alloc.project_code || "—",
          name: alloc.project_name || "Untitled Project",
        });
      }
    }

    const allocatedUserIds = Object.keys(userProjectsMap);

    // 3. Fetch today's timesheets for those users
    const todayTimesheets = await projectDb("project_timesheets")
      .where("log_date", todayIST)
      .whereIn("user_id", allocatedUserIds)
      .select("user_id", "hours_logged");

    const hoursPerUser = todayTimesheets.reduce((acc, ts) => {
      acc[ts.user_id] = (acc[ts.user_id] || 0) + Number(ts.hours_logged || 0);
      return acc;
    }, {} as Record<string, number>);

    // 4. Users who haven't logged today (less than 1 hour logged)
    const missingUserIds = allocatedUserIds.filter((uid) => (hoursPerUser[uid] || 0) < 1);

    if (missingUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All allocated members have logged their timesheets for today.",
        count: 0,
        date: todayIST,
      });
    }

    // 5. Fetch user profiles
    const usersToRemind = await identityDb("users")
      .whereIn("id", missingUserIds)
      .select("id", "email", "full_name");

    const rawBase = (process.env.NEXT_PUBLIC_APP_URL || "https://apps.acceleronsolutions.io").replace(/\/+$/, "");
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
    const baseUrl = basePath && !rawBase.endsWith(basePath) ? `${rawBase}${basePath}` : rawBase;
    const timesheetUrl = `${baseUrl}/my-timesheet`;

    let emailsSent = 0;
    const recipients: string[] = [];

    // 6. Send notification email to each individual
    for (const user of usersToRemind) {
      if (!user.email) continue;

      const userProjects = userProjectsMap[user.id] || [];
      const projectItemsHtml = userProjects
        .map(
          (p) =>
            `<li style="margin-bottom: 6px;"><strong>${p.code}:</strong> ${p.name}</li>`
        )
        .join("");

      const projectItemsText = userProjects
        .map((p) => `• [${p.code}] ${p.name}`)
        .join("\n");

      const htmlTemplate = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
          <div style="background-color: #0f172a; padding: 24px 28px; text-align: left;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Acceleron Plus &bull; Timesheet Reminder</h2>
          </div>
          <div style="padding: 28px; color: #1e293b;">
            <p style="font-size: 16px; margin-top: 0;">Hi <strong>${user.full_name || "there"}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">
              This is a reminder to submit your timesheet for today (<strong>${formattedDate}</strong>).
            </p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
              <p style="font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 0; margin-bottom: 10px;">
                Your Allocated Active Projects
              </p>
              <ul style="margin: 0; padding-left: 20px; color: #1e293b; font-size: 14px; line-height: 1.6;">
                ${projectItemsHtml}
              </ul>
            </div>

            <p style="font-size: 14px; line-height: 1.5; color: #64748b;">
              Keeping timesheets updated daily ensures accurate project tracking, billing, and resource reporting.
            </p>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${timesheetUrl}" 
                 style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">
                Fill Timesheet Now &rarr;
              </a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;">
              Link: <a href="${timesheetUrl}" style="color: #2563eb; text-decoration: underline;">${timesheetUrl}</a>
            </p>
          </div>
          <div style="padding: 16px 28px; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
            Acceleron Plus Automated Project Management System
          </div>
        </div>
      `;

      const textBody = `Hi ${user.full_name || "there"},\n\nThis is a reminder to log your timesheet for today (${formattedDate}).\n\nYour Allocated Projects:\n${projectItemsText}\n\nPlease fill your timesheet here:\n${timesheetUrl}\n\nAcceleron Plus Automated System`;

      const result = await sendMail({
        to: user.email,
        subject: `Reminder: Please log your timesheet for today (${todayIST})`,
        text: textBody,
        html: htmlTemplate,
      });

      if (result.sent) {
        emailsSent++;
        recipients.push(user.email);
      } else {
        console.warn(`[timesheet-reminder] Failed to send email to ${user.email}: ${result.skipped || result.error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${emailsSent} users out of ${usersToRemind.length} missing timesheets for ${todayIST}.`,
      date: todayIST,
      missingCount: usersToRemind.length,
      emailsSent,
      recipients,
    });
  } catch (err: any) {
    console.error("[timesheet-reminders.cron] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleTimesheetReminders(req);
}

export async function POST(req: Request) {
  return handleTimesheetReminders(req);
}
