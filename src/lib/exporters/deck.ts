// ═══════════════════════════════════════════════════════════════
// PowerPoint status deck.
//
// The slides a PM would otherwise rebuild by hand every fortnight:
// title, health, schedule, milestones, risks, tickets.
// ═══════════════════════════════════════════════════════════════

import PptxGenJS from "pptxgenjs";
import type { PlanExport } from "./plan-data";

const NAVY = "212F60";
const NAVY_SOFT = "6B7392";
const WHITE = "FFFFFF";
const RED = "C62828";
const AMBER = "B26A00";
const GREEN = "2E7D32";
const BLUE = "1565C0";
const RULE = "E6E8EE";

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

export async function buildDeck(plan: PlanExport): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9"; // 10 x 5.625 inches
  pptx.author = "Acceleron Plus";
  pptx.company = "Acceleron Solutions";
  pptx.title = `${plan.project.code} — ${plan.project.name}`;

  /** Shared chrome: a rule and the project code, so every slide is placeable. */
  const chrome = (slide: PptxGenJS.Slide, heading: string) => {
    slide.addText(heading, {
      x: 0.5, y: 0.35, w: 9, h: 0.4,
      fontSize: 22, bold: true, color: NAVY, fontFace: "Calibri",
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.5, y: 0.85, w: 9, h: 0,
      line: { color: RULE, width: 1 },
    });
    slide.addText(`${plan.project.code} · ${plan.project.name}`, {
      x: 0.5, y: 5.12, w: 7, h: 0.3,
      fontSize: 9, color: NAVY_SOFT, fontFace: "Calibri",
    });
  };

  // ── Title ─────────────────────────────────────────────────────
  const title = pptx.addSlide();
  title.background = { color: NAVY };
  title.addText("ACCELERON PROJECT+", {
    x: 0.6, y: 1.5, w: 8.8, h: 0.3,
    fontSize: 11, color: "9AA3C0", charSpacing: 2, fontFace: "Calibri",
  });
  title.addText(plan.project.name, {
    x: 0.6, y: 1.9, w: 8.8, h: 1,
    fontSize: 36, bold: true, color: WHITE, fontFace: "Calibri",
  });
  title.addText(
    [
      plan.project.code,
      plan.project.clientCompanyName,
      plan.project.currentPhase ? `Phase: ${plan.project.currentPhase}` : null,
    ].filter(Boolean).join("   ·   "),
    { x: 0.6, y: 2.95, w: 8.8, h: 0.4, fontSize: 14, color: "C7CCDE", fontFace: "Calibri" }
  );
  title.addText(`Status as at ${new Date(plan.generatedAt).toLocaleDateString("en-IN")}`, {
    x: 0.6, y: 4.6, w: 8.8, h: 0.3,
    fontSize: 11, color: "9AA3C0", fontFace: "Calibri",
  });

  // ── Health ────────────────────────────────────────────────────
  const health = pptx.addSlide();
  chrome(health, "Where the project stands");

  const openRisks = plan.risks.filter((r) => r.status === "open");
  const criticalRisks = openRisks.filter((r) => r.probability === "high" && r.impact === "high");
  const overdue = plan.milestones.filter(
    (m) => m.dueDate && m.status !== "completed" && new Date(m.dueDate) < new Date()
  );

  const tiles: { label: string; value: string; colour: string }[] = [
    { label: "Overall progress", value: `${plan.overallProgress}%`, colour: NAVY },
    { label: "Work packages", value: String(plan.wbs.length), colour: NAVY },
    {
      label: "Milestones overdue",
      value: String(overdue.length),
      colour: overdue.length > 0 ? RED : GREEN,
    },
    {
      label: "Critical risks",
      value: String(criticalRisks.length),
      colour: criticalRisks.length > 0 ? RED : GREEN,
    },
  ];

  tiles.forEach((tile, i) => {
    const x = 0.5 + i * 2.32;
    health.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.15, w: 2.1, h: 1.2,
      fill: { color: "F7F8FA" }, line: { color: RULE, width: 1 }, rectRadius: 0.08,
    });
    health.addText(tile.value, {
      x: x + 0.15, y: 1.3, w: 1.8, h: 0.6,
      fontSize: 28, bold: true, color: tile.colour, fontFace: "Calibri",
    });
    health.addText(tile.label, {
      x: x + 0.15, y: 1.92, w: 1.8, h: 0.3,
      fontSize: 9, color: NAVY_SOFT, fontFace: "Calibri",
    });
  });

  // Progress bar.
  health.addText("Completion", {
    x: 0.5, y: 2.7, w: 4, h: 0.25, fontSize: 11, bold: true, color: NAVY, fontFace: "Calibri",
  });
  health.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 3.0, w: 9, h: 0.28, fill: { color: "EDEFF4" }, rectRadius: 0.14,
  });
  if (plan.overallProgress > 0) {
    health.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y: 3.0, w: Math.max(0.3, (9 * plan.overallProgress) / 100), h: 0.28,
      fill: { color: NAVY }, rectRadius: 0.14,
    });
  }

  const detail: string[] = [
    `Status: ${titleCase(plan.project.status)}`,
    `Project manager: ${plan.project.projectManagerName ?? "—"}`,
    `Window: ${plan.project.startDate ?? "—"} to ${plan.project.plannedEndDate ?? "—"}`,
    `Linked ITSM tickets: ${plan.tickets.length}`,
  ];
  if (plan.financials) {
    detail.push(
      `Budget: ₹${(plan.financials.budgetInr ?? 0).toLocaleString("en-IN")}`,
      `Hours logged: ${plan.financials.totalLoggedHours.toFixed(1)}`,
      `Invoiced: ₹${plan.financials.invoicedInr.toLocaleString("en-IN")} across ${plan.financials.invoiceCount} invoice(s)`
    );
  }
  health.addText(detail.map((t) => ({ text: t, options: { breakLine: true } })), {
    x: 0.5, y: 3.5, w: 9, h: 1.4, fontSize: 11, color: NAVY_SOFT, fontFace: "Calibri", lineSpacing: 18,
  });

  // ── Schedule ──────────────────────────────────────────────────
  const scheduled = plan.wbs.filter((w) => w.startDate && w.endDate);
  if (scheduled.length > 0) {
    const gantt = pptx.addSlide();
    chrome(gantt, "Schedule");

    const times = scheduled.flatMap((w) => [
      new Date(w.startDate!).getTime(),
      new Date(w.endDate!).getTime(),
    ]);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = Math.max(1, max - min);

    const labelW = 2.6;
    const chartX = 0.5 + labelW;
    const chartW = 9 - labelW;
    const rows = scheduled.slice(0, 11);
    const rowH = 0.33;

    rows.forEach((item, i) => {
      const y = 1.15 + i * rowH;
      gantt.addText(`${item.code ? `${item.code} ` : ""}${item.name}`, {
        x: 0.5, y, w: labelW - 0.1, h: rowH,
        fontSize: 9, color: item.depth === 0 ? NAVY : NAVY_SOFT,
        bold: item.depth === 0, fontFace: "Calibri", valign: "middle",
      });

      const x1 = chartX + ((new Date(item.startDate!).getTime() - min) / span) * chartW;
      const x2 = chartX + ((new Date(item.endDate!).getTime() - min) / span) * chartW;
      const w = Math.max(0.12, x2 - x1);
      const colour = STATUS_COLOUR[item.status] ?? NAVY_SOFT;

      gantt.addShape(pptx.ShapeType.roundRect, {
        x: x1, y: y + 0.08, w, h: 0.17,
        fill: { color: colour, transparency: 72 }, rectRadius: 0.04,
      });
      if (item.progressPercent > 0) {
        gantt.addShape(pptx.ShapeType.roundRect, {
          x: x1, y: y + 0.08, w: Math.max(0.05, (w * item.progressPercent) / 100), h: 0.17,
          fill: { color: colour }, rectRadius: 0.04,
        });
      }
    });

    // Legend.
    let lx = 0.5;
    ([["Not started", NAVY_SOFT], ["In progress", BLUE], ["Blocked", RED], ["Completed", GREEN]] as [string, string][])
      .forEach(([label, colour]) => {
        gantt.addShape(pptx.ShapeType.roundRect, {
          x: lx, y: 4.92, w: 0.2, h: 0.1, fill: { color: colour }, rectRadius: 0.03,
        });
        gantt.addText(label, {
          x: lx + 0.25, y: 4.85, w: 1.1, h: 0.25, fontSize: 8, color: NAVY_SOFT, fontFace: "Calibri",
        });
        lx += 1.45;
      });

    if (scheduled.length > rows.length) {
      gantt.addText(`+ ${scheduled.length - rows.length} more work packages`, {
        x: 7.2, y: 4.85, w: 2.3, h: 0.25,
        fontSize: 8, color: NAVY_SOFT, italic: true, align: "right", fontFace: "Calibri",
      });
    }
  }

  // ── Milestones ────────────────────────────────────────────────
  if (plan.milestones.length > 0) {
    const slide = pptx.addSlide();
    chrome(slide, "Milestones");

    slide.addTable(
      [
        [
          { text: "Milestone", options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: "Due", options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: "Status", options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        ],
        ...plan.milestones.slice(0, 12).map((m) => {
          const isOverdue = m.dueDate && m.status !== "completed" && new Date(m.dueDate) < new Date();
          return [
            { text: m.name, options: { color: NAVY } },
            { text: m.dueDate ?? "—", options: { color: NAVY_SOFT } },
            {
              text: isOverdue ? "Overdue" : titleCase(m.status),
              options: {
                color: isOverdue ? RED : m.status === "completed" ? GREEN : AMBER,
                bold: Boolean(isOverdue),
              },
            },
          ];
        }),
      ],
      {
        x: 0.5, y: 1.15, w: 9,
        colW: [5.6, 1.7, 1.7],
        fontSize: 10, fontFace: "Calibri", border: { type: "solid", color: RULE, pt: 1 },
        rowH: 0.3, valign: "middle",
      }
    );
  }

  // ── Risks ─────────────────────────────────────────────────────
  if (openRisks.length > 0) {
    const slide = pptx.addSlide();
    chrome(slide, "Open risks and issues");

    slide.addTable(
      [
        [
          { text: "Risk", options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: "Probability", options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: "Impact", options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: "Mitigation", options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        ],
        ...openRisks.slice(0, 10).map((r) => {
          const critical = r.probability === "high" && r.impact === "high";
          return [
            { text: r.title, options: { color: critical ? RED : NAVY, bold: critical } },
            { text: titleCase(r.probability), options: { color: NAVY_SOFT } },
            { text: titleCase(r.impact), options: { color: NAVY_SOFT } },
            { text: r.mitigationPlan ?? "—", options: { color: NAVY_SOFT } },
          ];
        }),
      ],
      {
        x: 0.5, y: 1.15, w: 9,
        colW: [3.2, 1.2, 1.1, 3.5],
        fontSize: 9.5, fontFace: "Calibri", border: { type: "solid", color: RULE, pt: 1 },
        rowH: 0.32, valign: "middle",
      }
    );
  }

  // pptxgenjs types the nodebuffer case loosely; the runtime value is a Buffer.
  const out = (await pptx.write({ outputType: "nodebuffer" })) as unknown as Buffer;
  return Buffer.from(out);
}
