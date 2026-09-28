"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatISODate } from "@/lib/dates";

// ═══════════════════════════════════════════════════════════════
// What a client sees.
//
// Progress, dates, milestones, the documents shared with them and the
// tickets they raised. No cost, no rates, no internal team, no plan
// editing — and none of that is hidden client-side: the API never
// sends it.
// ═══════════════════════════════════════════════════════════════

const STATUS_STYLE: Record<string, string> = {
  not_started: "bg-navy-500/10 text-navy-700",
  in_progress: "bg-blue-500/10 text-blue-700",
  blocked: "bg-red-600/10 text-red-600",
  completed: "bg-emerald-500/10 text-emerald-700",
  pending: "bg-navy-500/10 text-navy-700",
  at_risk: "bg-amber-500/10 text-amber-700",
  missed: "bg-red-600/10 text-red-600",
};

const label = (value: string) => value.replace(/_/g, " ");

interface WorkPackage {
  code: string | null;
  name: string;
  status: string;
  progressPercent: number;
  startDate: string | null;
  endDate: string | null;
}

interface Milestone {
  name: string;
  dueDate: string | null;
  status: string;
  overdue: boolean;
}

interface Doc {
  id: string;
  title: string;
  documentType: string | null;
  sharedOn: string | null;
}

interface Ticket {
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  raisedOn: string | null;
}

interface Project {
  code: string;
  name: string;
  description: string | null;
  status: string;
  phase: string | null;
  startDate: string | null;
  plannedEndDate: string | null;
  progressPercent: number;
  workPackages: WorkPackage[];
  milestones: Milestone[];
  documents: Doc[];
  tickets: Ticket[];
  openTicketCount: number;
}

export function PortalClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [contactName, setContactName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/portal")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects ?? []);
        setContactName(d.contactName ?? null);
        setMessage(d.message ?? "");
      })
      .catch(() => setMessage("Could not load your projects."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-sm text-navy-500">Loading your projects…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          Your projects
        </h1>
        <p className="text-sm text-navy-500 mt-1">
          {contactName ? `Welcome back, ${contactName.split(" ")[0]}. ` : ""}
          Where each piece of work has got to, and what is coming next.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-navy-700">Nothing shared with you yet.</p>
            <p className="text-xs text-navy-500 mt-1.5 max-w-md mx-auto">{message}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const expanded = open === project.code;
            const nextMilestone = project.milestones.find((m) => m.status !== "completed");

            return (
              <Card key={project.code}>
                <div className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-[240px] flex-1">
                      <p className="text-[10px] font-mono text-navy-500">{project.code}</p>
                      <h2 className="text-lg font-bold text-navy-900">{project.name}</h2>
                      {project.description && (
                        <p className="text-sm text-navy-500 mt-1 max-w-2xl">{project.description}</p>
                      )}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {project.phase && (
                          <span className="text-[10px] px-2 py-1 rounded bg-navy-900/[0.06] text-navy-900 font-medium">
                            {project.phase}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 font-medium capitalize">
                          {label(project.status)}
                        </span>
                        {project.openTicketCount > 0 && (
                          <span className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-700 font-medium">
                            {project.openTicketCount} open{" "}
                            {project.openTicketCount === 1 ? "ticket" : "tickets"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right min-w-[150px]">
                      <p className="text-3xl font-bold text-navy-900">{project.progressPercent}%</p>
                      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden w-36 ml-auto mt-1">
                        <div
                          className="h-full bg-navy-700"
                          style={{ width: `${project.progressPercent}%` }}
                        />
                      </div>
                      {project.plannedEndDate && (
                        <p className="text-[11px] text-navy-500 mt-1.5">
                          due {formatISODate(project.plannedEndDate)}
                        </p>
                      )}
                    </div>
                  </div>

                  {nextMilestone && (
                    <p
                      className={`text-xs mt-3 ${
                        nextMilestone.overdue ? "text-red-600 font-medium" : "text-navy-700"
                      }`}
                    >
                      Next milestone: {nextMilestone.name}
                      {nextMilestone.dueDate && ` — ${formatISODate(nextMilestone.dueDate)}`}
                      {nextMilestone.overdue && " (overdue)"}
                    </p>
                  )}

                  <button
                    onClick={() => setOpen(expanded ? null : project.code)}
                    className="text-xs text-navy-700 underline mt-3 cursor-pointer"
                  >
                    {expanded ? "Hide the detail" : "See the detail"}
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-neutral-100 px-6 py-5 space-y-5 bg-neutral-50/40">
                    <Section title="Progress by stage">
                      {project.workPackages.length === 0 ? (
                        <p className="text-xs text-navy-500">The plan is not published yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {project.workPackages.map((p) => (
                            <div key={`${p.code}-${p.name}`} className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm text-navy-900 min-w-[190px]">{p.name}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                                  STATUS_STYLE[p.status] ?? STATUS_STYLE.not_started
                                }`}
                              >
                                {label(p.status)}
                              </span>
                              <div className="flex-1 min-w-[120px] h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                                <div
                                  className="h-full bg-navy-700"
                                  style={{ width: `${p.progressPercent}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-navy-500 w-10 text-right">
                                {p.progressPercent}%
                              </span>
                              {p.endDate && (
                                <span className="text-[10px] text-navy-500 w-24 text-right">
                                  {p.endDate}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section title="Milestones">
                      {project.milestones.length === 0 ? (
                        <p className="text-xs text-navy-500">None set.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {project.milestones.map((m) => (
                            <span
                              key={m.name}
                              className={`text-[11px] px-2 py-1 rounded border ${
                                m.overdue
                                  ? "border-red-600/30 bg-red-600/5 text-red-600"
                                  : m.status === "completed"
                                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                                    : "border-neutral-200 bg-white text-navy-700"
                              }`}
                            >
                              {m.name}
                              {m.dueDate && <span className="text-navy-500"> · {formatISODate(m.dueDate)}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section title="Documents shared with you">
                      {project.documents.length === 0 ? (
                        <p className="text-xs text-navy-500">Nothing shared yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {project.documents.map((d) => (
                            <a
                              key={d.id}
                              href={`/api/documents/${d.id}/download`}
                              className="flex items-center gap-2 text-sm text-navy-700 hover:text-navy-900 underline"
                            >
                              {d.title}
                              {d.documentType && (
                                <span className="text-[10px] text-navy-500 no-underline">
                                  {d.documentType}
                                </span>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section title="Your tickets">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                        <p className="text-xs text-navy-500">
                          Anything you have raised against this project.
                        </p>
                        <Link
                          data-guide="portal:raise-ticket"
                          href="/itsm/new"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-navy-900 text-white hover:bg-navy-700"
                        >
                          Raise a ticket
                        </Link>
                      </div>
                      {project.tickets.length === 0 ? (
                        <p className="text-xs text-navy-500">Nothing raised.</p>
                      ) : (
                        <div className="space-y-1">
                          {project.tickets.map((t) => (
                            <Link
                              key={t.ticketNumber}
                              href={`/itsm/${t.ticketNumber}`}
                              className="flex items-center gap-3 text-sm hover:bg-white rounded px-1 py-0.5"
                            >
                              <span className="font-mono text-[10px] text-navy-500 w-24">
                                {t.ticketNumber}
                              </span>
                              <span className="text-navy-900 flex-1 truncate">{t.subject}</span>
                              <span className="text-[10px] text-navy-500 capitalize">
                                {label(t.status)}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </Section>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}
