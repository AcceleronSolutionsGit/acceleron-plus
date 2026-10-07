import { NextResponse } from "next/server";
import { projectDb, identityDb } from "@/lib/db";
import { sendMail } from "@/lib/mailer";

export async function GET(req: Request) {
  try {
    // 1. Validate Cron Secret (Optional, for security)
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Get today's date in IST (yyyy-mm-dd format)
    const now = new Date();
    const todayIST = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);

    // 3. Find all users allocated to ACTIVE projects
    const activeAllocations = await projectDb("project_team_members")
      .join("projects", "project_team_members.project_id", "projects.id")
      .where("projects.status", "active")
      .where("project_team_members.is_active", true)
      .select("project_team_members.user_id");

    const allocatedUserIds = [...new Set(activeAllocations.map(a => a.user_id))];

    if (allocatedUserIds.length === 0) {
      return NextResponse.json({ message: "No active project allocations found.", count: 0 });
    }

    // 4. Fetch today's timesheets for those users
    const todayTimesheets = await projectDb("project_timesheets")
      .where("log_date", todayIST)
      .whereIn("user_id", allocatedUserIds)
      .select("user_id", "hours_logged");

    const hoursPerUser = todayTimesheets.reduce((acc, ts) => {
      acc[ts.user_id] = (acc[ts.user_id] || 0) + Number(ts.hours_logged);
      return acc;
    }, {} as Record<string, number>);

    // 5. Determine who needs a reminder (0 hours or less than expected, let's say < 1 hour)
    const missingUsers = allocatedUserIds.filter(uid => (hoursPerUser[uid] || 0) < 1);

    if (missingUsers.length === 0) {
      return NextResponse.json({ message: "Everyone has logged their timesheets for today.", count: 0 });
    }

    // 6. Fetch user emails
    const usersToRemind = await identityDb("users")
      .whereIn("id", missingUsers)
      .select("id", "email", "full_name");

    let emailsSent = 0;

    // 7. Send the emails using the template
    for (const user of usersToRemind) {
      if (!user.email) continue;

      const htmlTemplate = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #f43f5e; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">Timesheet Reminder</h2>
          </div>
          <div style="padding: 30px; background-color: #ffffff; color: #334155;">
            <p style="font-size: 16px;">Hi <strong>${user.full_name}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.5;">
              This is a gentle reminder that you have not logged your timesheet for today (<strong>${todayIST}</strong>) on your allocated projects.
            </p>
            <p style="font-size: 16px; line-height: 1.5;">
              Please ensure you log your hours by the end of the day to keep project financials and tracking up to date.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pmt" 
                 style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Log Timesheet Now
              </a>
            </div>
            <p style="font-size: 14px; color: #94a3b8; text-align: center; margin-top: 40px;">
              Acceleron Plus Automated System
            </p>
          </div>
        </div>
      `;

      const result = await sendMail({
        to: user.email,
        subject: "Action Required: Please log your timesheet for today",
        text: `Hi ${user.full_name}, please log your timesheet for today (${todayIST}).`,
        html: htmlTemplate,
      });

      if (result.sent) {
        emailsSent++;
      } else {
        console.warn(`Failed to send email to ${user.email}: ${result.skipped || result.error}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Reminder sent to ${emailsSent} users out of ${usersToRemind.length} missing timesheets.`,
      date: todayIST
    });

  } catch (err) {
    console.error("Cron Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
