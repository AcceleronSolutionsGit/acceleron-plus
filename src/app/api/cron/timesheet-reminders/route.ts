import { NextResponse } from "next/server";
import { projectDb, identityDb } from "@/lib/db";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";

const isUUID = (str: unknown): str is string =>
  typeof str === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());

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

    // 2. Find all active allocations on active projects
    const activeAllocations = await projectDb("project_team_members")
      .join("projects", "project_team_members.project_id", "projects.id")
      .where("project_team_members.is_active", true)
      .whereNotIn("projects.status", ["closed", "cancelled", "scrapped"])
      .select(
        "project_team_members.user_id",
        "project_team_members.employee_id",
        "project_team_members.user_name",
        "projects.code as project_code",
        "projects.name as project_name"
      );

    if (activeAllocations.length === 0) {
      return NextResponse.json({ success: true, message: "No active project allocations found.", count: 0 });
    }

    // Collect IDs separating valid UUIDs from Employee IDs (to prevent PostgreSQL invalid uuid syntax error)
    const uuidList: string[] = [];
    const empIdList: string[] = [];

    for (const alloc of activeAllocations) {
      if (alloc.user_id) {
        if (isUUID(alloc.user_id)) uuidList.push(alloc.user_id);
        else empIdList.push(String(alloc.user_id).trim());
      }
      if (alloc.employee_id) {
        if (isUUID(alloc.employee_id)) uuidList.push(alloc.employee_id);
        else empIdList.push(String(alloc.employee_id).trim());
      }
    }

    const distinctUuids = [...new Set(uuidList)];
    const distinctEmpIds = [...new Set(empIdList)];

    // Map each identifier (UUID or employee ID) to their user profile
    const userMap = new Map<string, { email: string; fullName: string; darwinboxRef?: string | null }>();

    if (distinctUuids.length > 0) {
      const usersById = await identityDb("users")
        .whereIn("id", distinctUuids)
        .select("id", "email", "full_name", "darwinbox_ref");

      for (const u of usersById) {
        const email = u.email ? u.email.toLowerCase().trim() : "";
        if (email) {
          const info = { email, fullName: u.full_name || "Team Member", darwinboxRef: u.darwinbox_ref };
          userMap.set(u.id, info);
          if (u.darwinbox_ref) userMap.set(String(u.darwinbox_ref).trim(), info);
        }
      }
    }

    if (distinctEmpIds.length > 0) {
      // 1. Look up by darwinbox_ref in users
      const usersByRef = await identityDb("users")
        .whereIn("darwinbox_ref", distinctEmpIds)
        .select("id", "email", "full_name", "darwinbox_ref");

      for (const u of usersByRef) {
        const email = u.email ? u.email.toLowerCase().trim() : "";
        if (email) {
          const info = { email, fullName: u.full_name || "Team Member", darwinboxRef: u.darwinbox_ref };
          userMap.set(u.id, info);
          if (u.darwinbox_ref) userMap.set(String(u.darwinbox_ref).trim(), info);
        }
      }

      // 2. Look up remaining employee IDs in employee_master
      const remainingEmpIds = distinctEmpIds.filter((id) => !userMap.has(id));
      if (remainingEmpIds.length > 0) {
        const emps = await identityDb("employee_master")
          .whereIn("employee_id", remainingEmpIds)
          .select("employee_id", "company_email_id", "full_name");

        for (const emp of emps) {
          const email = emp.company_email_id ? emp.company_email_id.toLowerCase().trim() : "";
          if (email) {
            userMap.set(String(emp.employee_id).trim(), {
              email,
              fullName: emp.full_name || "Team Member",
              darwinboxRef: emp.employee_id,
            });
          }
        }
      }
    }

    // 3. Fetch today's timesheets for all possible identifiers
    const allIdentifiers = [...new Set([...distinctUuids, ...distinctEmpIds])];
    const todayTimesheets = await projectDb("project_timesheets")
      .where("log_date", todayIST)
      .whereIn("user_id", allIdentifiers)
      .select("user_id", "hours_logged");

    const hoursByIdentifier: Record<string, number> = {};
    for (const ts of todayTimesheets) {
      hoursByIdentifier[ts.user_id] = (hoursByIdentifier[ts.user_id] || 0) + Number(ts.hours_logged || 0);
    }

    // 4. Group allocations and total logged hours by recipient EMAIL (consolidating duplicates)
    interface RecipientTarget {
      email: string;
      fullName: string;
      projects: Array<{ code: string; name: string }>;
      totalHoursToday: number;
    }

    const recipientMap = new Map<string, RecipientTarget>();

    for (const alloc of activeAllocations) {
      const uKey = alloc.user_id ? String(alloc.user_id).trim() : null;
      const empKey = alloc.employee_id ? String(alloc.employee_id).trim() : null;

      const profile = (uKey ? userMap.get(uKey) : undefined) || (empKey ? userMap.get(empKey) : undefined);
      const email = profile?.email;
      if (!email) continue; // cannot email without a destination address

      const fullName = profile?.fullName || alloc.user_name || "Team Member";

      if (!recipientMap.has(email)) {
        recipientMap.set(email, {
          email,
          fullName,
          projects: [],
          totalHoursToday: 0,
        });
      }

      const target = recipientMap.get(email)!;

      // Add project if not already in list
      if (!target.projects.some((p) => p.code === alloc.project_code)) {
        target.projects.push({
          code: alloc.project_code || "—",
          name: alloc.project_name || "Untitled Project",
        });
      }

      // Sum hours logged by any of the user's identifiers
      const hoursFromU = uKey ? hoursByIdentifier[uKey] || 0 : 0;
      const hoursFromEmp = empKey ? hoursByIdentifier[empKey] || 0 : 0;
      target.totalHoursToday = Math.max(target.totalHoursToday, hoursFromU, hoursFromEmp);
    }

    // 5. Filter for individuals who have logged < 1 hour today
    const missingRecipients = Array.from(recipientMap.values()).filter(
      (target) => target.totalHoursToday < 1
    );

    if (missingRecipients.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All allocated members have logged their timesheets for today.",
        count: 0,
        date: todayIST,
      });
    }

    const rawBase = (process.env.NEXT_PUBLIC_APP_URL || "https://apps.acceleronsolutions.io").replace(/\/+$/, "");
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
    const baseUrl = basePath && !rawBase.endsWith(basePath) ? `${rawBase}${basePath}` : rawBase;
    const timesheetUrl = `${baseUrl}/my-timesheet`;

    let emailsSent = 0;
    const dispatchedRecipients: string[] = [];

    // 6. Send reminder email to each individual
    for (const target of missingRecipients) {
      const projectItemsHtml = target.projects
        .map(
          (p) =>
            `<li style="margin-bottom: 6px;"><strong>${p.code}:</strong> ${p.name}</li>`
        )
        .join("");

      const projectItemsText = target.projects
        .map((p) => `• [${p.code}] ${p.name}`)
        .join("\n");

      const htmlTemplate = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
          <div style="background-color: #0f172a; padding: 24px 28px; text-align: left;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Acceleron Plus &bull; Timesheet Reminder</h2>
          </div>
          <div style="padding: 28px; color: #1e293b;">
            <p style="font-size: 16px; margin-top: 0;">Hi <strong>${target.fullName}</strong>,</p>
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
              Direct Link: <a href="${timesheetUrl}" style="color: #2563eb; text-decoration: underline;">${timesheetUrl}</a>
            </p>
          </div>
          <div style="padding: 16px 28px; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
            Acceleron Plus Automated Project Management System
          </div>
        </div>
      `;

      const textBody = `Hi ${target.fullName},\n\nThis is a reminder to log your timesheet for today (${formattedDate}).\n\nYour Allocated Projects:\n${projectItemsText}\n\nPlease fill your timesheet here:\n${timesheetUrl}\n\nAcceleron Plus Automated System`;

      const result = await sendMail({
        to: target.email,
        subject: `Reminder: Please log your timesheet for today (${todayIST})`,
        text: textBody,
        html: htmlTemplate,
      });

      if (result.sent) {
        emailsSent++;
        dispatchedRecipients.push(target.email);
      } else {
        console.warn(`[timesheet-reminder] Failed to send email to ${target.email}: ${result.skipped || result.error}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${emailsSent} users out of ${missingRecipients.length} missing timesheets for ${todayIST}.`,
      date: todayIST,
      missingCount: missingRecipients.length,
      emailsSent,
      recipients: dispatchedRecipients,
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
