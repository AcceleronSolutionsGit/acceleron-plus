"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { AppRole } from "@/lib/types";

interface MissingMember {
  userId: string;
  userName: string;
  employeeId: string | null;
  status: "not_logged" | "draft_only" | "rejected_only";
}

export function TimesheetsTab({ projectId, userRole }: { projectId: string; userRole: AppRole }) {
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [missingMembers, setMissingMembers] = useState<MissingMember[]>([]);
  const [missingWeek, setMissingWeek] = useState<{ start: string; end: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const canApprove = userRole === "pm" || userRole === "admin";

  const fetchTimesheets = useCallback(async () => {
    try {
      const requests: Promise<Response>[] = [
        fetch(`/api/pmt/projects/${projectId}/timesheets`),
      ];
      if (canApprove) {
        requests.push(fetch(`/api/pmt/timesheets/missing?project=${projectId}`));
      }
      const [tsRes, missRes] = await Promise.all(requests);
      if (tsRes.ok) {
        setTimesheets((await tsRes.json()).data ?? []);
      }
      if (missRes && missRes.ok) {
        const missData = await missRes.json().catch(() => ({}));
        setMissingMembers(missData.individuals ?? []);
        if (missData.weekStart && missData.weekEnd) {
          setMissingWeek({ start: missData.weekStart, end: missData.weekEnd });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, canApprove]);

  useEffect(() => {
    void fetchTimesheets();
  }, [fetchTimesheets]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    let rejectionReason: string | undefined = undefined;
    if (action === "reject") {
      const reason = prompt("Please provide a reason for rejecting this timesheet:");
      if (!reason || !reason.trim()) return;
      rejectionReason = reason.trim();
    } else {
      if (!confirm("Are you sure you want to approve this timesheet entry?")) return;
    }

    try {
      const res = await fetch("/api/pmt/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action, rejectionReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        void fetchTimesheets();
      } else {
        alert(data.error || "Failed to update timesheet.");
      }
    } catch {
      alert("Failed to update timesheet.");
    }
  };

  if (loading) return <div className="p-6 animate-pulse bg-navy-50 h-64 rounded-xl" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Project Timesheets</h2>
          <p className="text-sm text-navy-500">
            Track and approve logged hours (PM self-approvals are routed to their Reporting Manager)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && (
            <Link
              href={`/admin/timesheets?project=${projectId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-navy-700 bg-navy-50 border border-navy-900/10 rounded-lg hover:bg-navy-100 transition-colors"
            >
              Open Approval Queue →
            </Link>
          )}
          <button
            onClick={async () => {
              const res = await fetch(`/api/admin/timesheets?project=${projectId}`);
              if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `project_timesheets_${new Date().toISOString().slice(0, 10)}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-navy-700 bg-white border border-navy-900/15 rounded-lg hover:bg-navy-50 transition-colors shadow-xs cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3.5 13.5v2A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-2M10 3.5v9M7 9.5l3 3.5 3-3.5" />
            </svg>
            Export Excel
          </button>
        </div>
      </div>

      {/* Missing timesheets callout for PMs/Admins */}
      {canApprove && missingMembers.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
              <p className="text-xs font-semibold text-amber-900">
                {missingMembers.length} allocated team {missingMembers.length === 1 ? "member hasn't" : "members haven't"} submitted timesheets this week
                {missingWeek ? ` (${missingWeek.start} to ${missingWeek.end})` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-4">
              {missingMembers.slice(0, 8).map((m) => (
                <span
                  key={m.userId}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-900"
                >
                  {m.userName}
                  <span className="text-[10px] text-amber-600">
                    ({m.status === "draft_only" ? "draft only" : "0h"})
                  </span>
                </span>
              ))}
              {missingMembers.length > 8 && (
                <span className="text-[11px] text-amber-700 font-medium px-1.5 py-0.5">
                  +{missingMembers.length - 8} more
                </span>
              )}
            </div>
          </div>
          <Link
            href={`/admin/timesheets?tab=missing&project=${projectId}`}
            className="text-xs font-semibold text-amber-900 hover:underline whitespace-nowrap"
          >
            View &amp; Remind →
          </Link>
        </div>
      )}

      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-50/50 text-navy-500 font-medium">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Team Member</th>
              <th className="px-5 py-3">Hours / Alloc</th>
              <th className="px-5 py-3">Task/Ticket Ref</th>
              <th className="px-5 py-3">Status</th>
              {canApprove && <th className="px-5 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-500/10">
            {timesheets.map((t) => {
              const dateVal = t.logDate || t.date_logged || t.log_date;
              const formattedDate = dateVal ? formatDate(dateVal).split(",")[0] : "—";
              const userVal = t.userName || t.user_name || "—";
              const hoursVal = t.hoursLogged ?? t.hours ?? 0;
              const taskVal = t.wbsName || t.task_description || t.notes || "—";
              const extraReason = t.extraHoursReason || t.extra_hours_reason || null;
              const dailyAlloc = t.dailyAllocatedHours != null ? Number(t.dailyAllocatedHours) : null;
              const isExtra = dailyAlloc != null && hoursVal > dailyAlloc;
              const statusVal = t.status || "pending";
              const isPending = statusVal === "pending" || statusVal === "submitted";
              const canActOnRow = isPending && t.canApproveEntry === true;

              return (
                <tr key={t.id} className="hover:bg-navy-50/30">
                  <td className="px-5 py-3 font-medium text-navy-900">{formattedDate}</td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-navy-900">{userVal}</span>
                    {t.isPmEntry && (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                        PM
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-bold text-navy-900">{hoursVal}h</span>
                    {dailyAlloc != null && (
                      <span className="text-xs text-navy-400 block font-normal">
                        / {dailyAlloc}h alloc
                      </span>
                    )}
                    {isExtra && (
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-300 mt-0.5">
                        +{Math.round(((hoursVal - dailyAlloc) + Number.EPSILON) * 100) / 100}h extra
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-navy-900">{taskVal}</span>
                    {extraReason && (
                      <div className="mt-1 p-1.5 bg-amber-50 rounded border border-amber-200 text-xs text-amber-900 max-w-md">
                        <span className="font-semibold block text-[10px] uppercase tracking-wider text-amber-800">
                          Extra hour justification:
                        </span>
                        <span className="italic">"{extraReason}"</span>
                      </div>
                    )}
                    {(t.itsmTicketId || t.itsm_ticket_id) && (
                      <span className="block text-[10px] text-blue-600 mt-0.5">
                        Ticket: {t.itsmTicketId || t.itsm_ticket_id}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        statusVal === "approved"
                          ? "bg-green-100 text-green-700"
                          : statusVal === "rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {statusVal}
                    </span>
                  </td>
                  {canApprove && (
                    <td className="px-5 py-3 text-right">
                      {canActOnRow ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAction(t.id, "approve")}
                            className="text-xs px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-semibold cursor-pointer transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(t.id, "reject")}
                            className="text-xs px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-semibold cursor-pointer transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : isPending && t.approvalHint ? (
                        <span
                          title="PM self-approval is not allowed — routed to Reporting Manager"
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"
                        >
                          {t.approvalHint}
                        </span>
                      ) : (
                        <span className="text-xs text-navy-400 capitalize">{statusVal}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {timesheets.length === 0 && (
              <tr>
                <td colSpan={canApprove ? 6 : 5} className="px-5 py-8 text-center text-navy-500">
                  No timesheets found for this project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
