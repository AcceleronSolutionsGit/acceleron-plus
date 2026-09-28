// ═══════════════════════════════════════════════════════════════
// PDF export — a cover page, a drawn Gantt chart, then the tables.
//
// PDFKit draws primitives, so the chart is composed here rather than
// screenshotted. That keeps it vector-sharp when printed and avoids
// shipping a headless browser.
// ═══════════════════════════════════════════════════════════════

const PDFDocument = require("pdfkit");
import type { PlanExport, PlanWbsItem } from "./plan-data";

const NAVY = "#212F60";
const NAVY_SOFT = "#6B7392";
const RULE = "#E6E8EE";
const RED = "#C62828";
const AMBER = "#B26A00";
const GREEN = "#2E7D32";
const BLUE = "#1565C0";

const STATUS_COLOUR: Record<string, string> = {
  completed: GREEN,
  in_progress: BLUE,
  blocked: RED,
  not_started: NAVY_SOFT,
};

function titleCase(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** Collect the document into a Buffer. */
function render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: { Title: "Project plan", Creator: "Acceleron Plus" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      build(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function buildPdf(plan: PlanExport): Promise<Buffer> {
  return render((doc) => {
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    // ── Header ────────────────────────────────────────────────
    const header = (subtitle: string) => {
      doc.fillColor(NAVY_SOFT).fontSize(8).font("Helvetica")
        .text("ACCELERON PROJECT+", left, 30, { characterSpacing: 1.2 });
      doc.fillColor(NAVY).fontSize(16).font("Helvetica-Bold")
        .text(`${plan.project.code} — ${plan.project.name}`, left, 44);
      doc.fillColor(NAVY_SOFT).fontSize(9).font("Helvetica").text(subtitle, left, 64);
      doc.moveTo(left, 80).lineTo(left + width, 80).strokeColor(RULE).lineWidth(1).stroke();
      return 92;
    };

    // ── Page 1: summary ───────────────────────────────────────
    let y = header(
      [
        plan.project.clientCompanyName,
        plan.project.currentPhase ? `Phase: ${plan.project.currentPhase}` : null,
        `Exported ${new Date(plan.generatedAt).toLocaleDateString("en-IN")}`,
      ].filter(Boolean).join("   ·   ")
    );

    // Stat tiles.
    const tiles: [string, string][] = [
      ["Overall progress", `${plan.overallProgress}%`],
      ["Work packages", String(plan.wbs.length)],
      ["Milestones", String(plan.milestones.length)],
      ["Open risks", String(plan.risks.filter((r) => r.status === "open").length)],
      ["Linked tickets", String(plan.tickets.length)],
    ];
    if (plan.financials?.budgetInr != null) {
      tiles.push(["Budget", `₹${(plan.financials.budgetInr / 100000).toFixed(1)}L`]);
    }

    const tileW = (width - (tiles.length - 1) * 10) / tiles.length;
    tiles.forEach(([label, value], i) => {
      const x = left + i * (tileW + 10);
      doc.roundedRect(x, y, tileW, 52, 6).fillColor("#F7F8FA").fill();
      doc.fillColor(NAVY_SOFT).fontSize(7.5).font("Helvetica")
        .text(label.toUpperCase(), x + 10, y + 10, { width: tileW - 20, characterSpacing: 0.6 });
      doc.fillColor(NAVY).fontSize(18).font("Helvetica-Bold")
        .text(value, x + 10, y + 24, { width: tileW - 20 });
    });
    y += 70;

    // Details.
    doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold").text("Project details", left, y);
    y += 18;
    const details: [string, string][] = [
      ["Status", titleCase(plan.project.status)],
      ["Project manager", plan.project.projectManagerName ?? "—"],
      ["Start date", plan.project.startDate ?? "—"],
      ["Planned end", plan.project.plannedEndDate ?? "—"],
    ];
    details.forEach(([label, value], i) => {
      const x = left + (i % 2) * (width / 2);
      const row = y + Math.floor(i / 2) * 16;
      doc.fillColor(NAVY_SOFT).fontSize(9).font("Helvetica").text(`${label}:`, x, row, { width: 110 });
      doc.fillColor(NAVY).font("Helvetica-Bold").text(value, x + 110, row, { width: width / 2 - 120 });
    });
    y += 40;

    if (plan.project.description) {
      doc.fillColor(NAVY_SOFT).fontSize(9).font("Helvetica")
        .text(plan.project.description, left, y, { width, height: 60, ellipsis: true });
    }

    // ── Page 2: the Gantt ─────────────────────────────────────
    if (plan.wbs.length > 0) {
      doc.addPage();
      y = header("Schedule");
      drawGantt(doc, plan, left, y, width);
    }

    // ── Tables ────────────────────────────────────────────────
    const table = (
      title: string,
      columns: { label: string; width: number }[],
      rows: (string | null)[][],
      highlight?: (row: number) => string | null
    ) => {
      if (rows.length === 0) return;
      doc.addPage();
      let ty = header(title);

      const drawHead = () => {
        doc.rect(left, ty, width, 20).fillColor(NAVY).fill();
        let x = left + 6;
        columns.forEach((col) => {
          doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold")
            .text(col.label.toUpperCase(), x, ty + 6, { width: col.width - 8, ellipsis: true });
          x += col.width;
        });
        ty += 20;
      };
      drawHead();

      rows.forEach((row, index) => {
        if (ty > doc.page.height - 60) {
          doc.addPage();
          ty = header(`${title} (continued)`);
          drawHead();
        }
        if (index % 2 === 1) {
          doc.rect(left, ty, width, 18).fillColor("#F7F8FA").fill();
        }
        let x = left + 6;
        const colour = highlight?.(index) ?? NAVY;
        row.forEach((cell, ci) => {
          doc.fillColor(ci === 0 ? colour : NAVY_SOFT).fontSize(8).font(ci === 0 ? "Helvetica-Bold" : "Helvetica")
            .text(cell ?? "—", x, ty + 5, { width: columns[ci].width - 8, height: 12, ellipsis: true });
          x += columns[ci].width;
        });
        ty += 18;
      });
    };

    table(
      "Work breakdown",
      [
        { label: "Code", width: 60 },
        { label: "Work package", width: width - 420 },
        { label: "Status", width: 80 },
        { label: "Start", width: 70 },
        { label: "End", width: 70 },
        { label: "Progress", width: 60 },
        { label: "Hours", width: 80 },
      ],
      plan.wbs.map((w) => [
        w.code,
        `${"   ".repeat(w.depth)}${w.name}`,
        titleCase(w.status),
        w.startDate,
        w.endDate,
        `${w.progressPercent}%`,
        w.estimatedHours != null ? String(w.estimatedHours) : "—",
      ])
    );

    table(
      "Milestones",
      [
        { label: "Milestone", width: width - 280 },
        { label: "Due", width: 90 },
        { label: "Status", width: 90 },
        { label: "Completed", width: 100 },
      ],
      plan.milestones.map((m) => {
        const overdue = m.dueDate && m.status !== "completed" && new Date(m.dueDate) < new Date();
        return [m.name, m.dueDate, overdue ? "Overdue" : titleCase(m.status), m.completedAt];
      }),
      (i) => {
        const m = plan.milestones[i];
        const overdue = m.dueDate && m.status !== "completed" && new Date(m.dueDate) < new Date();
        return overdue ? RED : m.status === "completed" ? GREEN : NAVY;
      }
    );

    table(
      "Risks and issues",
      [
        { label: "Risk", width: width - 300 },
        { label: "Probability", width: 90 },
        { label: "Impact", width: 90 },
        { label: "Status", width: 120 },
      ],
      plan.risks.map((r) => [r.title, titleCase(r.probability), titleCase(r.impact), titleCase(r.status)]),
      (i) => {
        const r = plan.risks[i];
        return r.probability === "high" && r.impact === "high" ? RED : NAVY;
      }
    );

    if (plan.reviews.length > 0) {
      table(
        "Stage-gate reviews",
        [
          { label: "Review", width: width - 320 },
          { label: "Date", width: 100 },
          { label: "Outcome", width: 120 },
          { label: "Notes", width: 100 },
        ],
        plan.reviews.map((r) => [r.reviewType, r.reviewDate, titleCase(r.outcome), r.notes]),
        (i) => (plan.reviews[i].outcome === "fail" ? RED : NAVY)
      );
    }
  });
}

/** The chart itself: a date axis, one bar per work package, milestones as diamonds. */
function drawGantt(
  doc: PDFKit.PDFDocument,
  plan: PlanExport,
  left: number,
  top: number,
  width: number
) {
  const scheduled = plan.wbs.filter((w) => w.startDate && w.endDate);
  const dates: Date[] = [];
  scheduled.forEach((w) => {
    dates.push(new Date(w.startDate!), new Date(w.endDate!));
  });
  plan.milestones.forEach((m) => m.dueDate && dates.push(new Date(m.dueDate)));

  if (dates.length === 0) {
    doc.fillColor(NAVY_SOFT).fontSize(10).font("Helvetica")
      .text("No work package has dates yet, so there is no schedule to draw.", left, top + 20);
    return;
  }

  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  // A little breathing room either side.
  min.setDate(min.getDate() - 3);
  max.setDate(max.getDate() + 3);

  const labelW = 210;
  const chartX = left + labelW;
  const chartW = width - labelW;
  const totalDays = Math.max(1, dayDiff(min, max));
  const xFor = (date: Date) => chartX + (dayDiff(min, date) / totalDays) * chartW;

  // ── Month axis ────────────────────────────────────────────
  let axisY = top;
  doc.fillColor(NAVY_SOFT).fontSize(7.5).font("Helvetica");

  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cursor <= max) {
    const x = xFor(cursor);
    if (x >= chartX && x <= chartX + chartW) {
      doc.moveTo(x, axisY + 12).lineTo(x, axisY + 16 + Math.min(plan.wbs.length, 26) * 16)
        .strokeColor(RULE).lineWidth(0.5).stroke();
      doc.fillColor(NAVY_SOFT)
        .text(cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), x + 2, axisY, {
          width: 60,
          lineBreak: false,
        });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Today.
  const now = new Date();
  if (now >= min && now <= max) {
    const x = xFor(now);
    doc.moveTo(x, axisY + 12).lineTo(x, axisY + 16 + Math.min(plan.wbs.length, 26) * 16)
      .strokeColor(RED).lineWidth(1).dash(2, { space: 2 }).stroke().undash();
    doc.fillColor(RED).fontSize(7).text("today", x + 2, axisY + 4, { lineBreak: false });
  }

  axisY += 18;

  // ── Bars ──────────────────────────────────────────────────
  const rowH = 16;
  // 26 rows fit on a landscape A4 below the header.
  const shown = plan.wbs.slice(0, 26);

  shown.forEach((item, index) => {
    const y = axisY + index * rowH;

    doc.fillColor(item.depth === 0 ? NAVY : NAVY_SOFT)
      .fontSize(8)
      .font(item.depth === 0 ? "Helvetica-Bold" : "Helvetica")
      .text(`${"  ".repeat(item.depth)}${item.code ? `${item.code} ` : ""}${item.name}`, left, y + 3, {
        width: labelW - 8,
        height: 11,
        ellipsis: true,
      });

    if (!item.startDate || !item.endDate) {
      doc.fillColor("#C7CBD8").fontSize(7).font("Helvetica-Oblique")
        .text("not scheduled", chartX + 2, y + 4, { lineBreak: false });
      return;
    }

    const x1 = xFor(new Date(item.startDate));
    const x2 = Math.max(x1 + 3, xFor(new Date(item.endDate)));
    const colour = STATUS_COLOUR[item.status] ?? NAVY_SOFT;

    doc.roundedRect(x1, y + 2, x2 - x1, 10, 2).fillColor(colour).opacity(0.25).fill().opacity(1);

    if (item.progressPercent > 0) {
      doc.roundedRect(x1, y + 2, ((x2 - x1) * item.progressPercent) / 100, 10, 2)
        .fillColor(colour).fill();
    }

    if (x2 - x1 > 34) {
      doc.fillColor("#FFFFFF").fontSize(6.5).font("Helvetica-Bold")
        .text(`${item.progressPercent}%`, x1 + 4, y + 5, { lineBreak: false });
    }
  });

  let footerY = axisY + shown.length * rowH + 6;

  if (plan.wbs.length > shown.length) {
    doc.fillColor(NAVY_SOFT).fontSize(7.5).font("Helvetica-Oblique")
      .text(`+ ${plan.wbs.length - shown.length} more work packages — see the Work breakdown table.`, left, footerY);
    footerY += 14;
  }

  // ── Milestones ────────────────────────────────────────────
  const dated = plan.milestones.filter((m) => m.dueDate);
  if (dated.length > 0) {
    doc.fillColor(NAVY).fontSize(8).font("Helvetica-Bold").text("Milestones", left, footerY + 4);
    const my = footerY + 18;
    doc.moveTo(chartX, my).lineTo(chartX + chartW, my).strokeColor(RULE).lineWidth(0.5).stroke();

    dated.forEach((m) => {
      const x = xFor(new Date(m.dueDate!));
      const overdue = m.status !== "completed" && new Date(m.dueDate!) < new Date();
      const colour = m.status === "completed" ? GREEN : overdue ? RED : AMBER;
      // A diamond, the conventional milestone mark.
      doc.moveTo(x, my - 5).lineTo(x + 5, my).lineTo(x, my + 5).lineTo(x - 5, my)
        .fillColor(colour).fill();
    });
    footerY = my + 12;
  }

  // ── Legend ────────────────────────────────────────────────
  const legend: [string, string][] = [
    ["Not started", NAVY_SOFT],
    ["In progress", BLUE],
    ["Blocked", RED],
    ["Completed", GREEN],
  ];
  let lx = left;
  const ly = footerY + 6;
  doc.fontSize(7.5).font("Helvetica");
  legend.forEach(([label, colour]) => {
    doc.roundedRect(lx, ly, 14, 7, 2).fillColor(colour).fill();
    doc.fillColor(NAVY_SOFT).text(label, lx + 18, ly, { lineBreak: false });
    lx += 18 + doc.widthOfString(label) + 14;
  });
}
