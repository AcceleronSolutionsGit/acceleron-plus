"use client";

import React, { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import type { AppRole } from "@/lib/types";

export function TimesheetsTab({ projectId, userRole }: { projectId: string, userRole: AppRole }) {
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimesheets = async () => {
    const res = await fetch(`/api/pmt/projects/${projectId}/timesheets`);
    if (res.ok) {
      setTimesheets((await res.json()).data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTimesheets(); }, [projectId]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    let rejectionReason: string | undefined = undefined;
    if (action === "reject") {
      const reason = prompt("Please provide a reason for rejecting this timesheet:");
      if (!reason || !reason.trim()) return;
      rejectionReason = reason.trim();
    } else {
      if (!confirm(`Are you sure you want to approve this timesheet entry?`)) return;
    }

    try {
      const res = await fetch("/api/pmt/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action, rejectionReason })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchTimesheets();
      } else {
        alert(data.error || "Failed to update timesheet.");
      }
    } catch {
      alert("Failed to update timesheet.");
    }
  };

  if (loading) return <div className="p-6 animate-pulse bg-navy-50 h-64 rounded-xl" />;

  const canApprove = userRole === "pm" || userRole === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Project Timesheets</h2>
          <p className="text-sm text-navy-500">Track and approve logged hours</p>
        </div>
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

      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-50/50 text-navy-500 font-medium">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Team Member</th>
              <th className="px-5 py-3">Hours</th>
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
              const statusVal = t.status || "pending";
              const canAct = statusVal === "pending" || statusVal === "submitted";

              return (
                <tr key={t.id} className="hover:bg-navy-50/30">
                  <td className="px-5 py-3 font-medium text-navy-900">{formattedDate}</td>
                  <td className="px-5 py-3">{userVal}</td>
                  <td className="px-5 py-3 font-bold">{hoursVal}h</td>
                  <td className="px-5 py-3">
                    <span className="text-navy-900">{taskVal}</span>
                    {(t.itsmTicketId || t.itsm_ticket_id) && (
                      <span className="block text-[10px] text-blue-600 mt-0.5">Ticket: {t.itsmTicketId || t.itsm_ticket_id}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase
                      ${statusVal === 'approved' ? 'bg-green-100 text-green-700' : statusVal === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {statusVal}
                    </span>
                  </td>
                  {canApprove && (
                    <td className="px-5 py-3 text-right">
                      {canAct ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleAction(t.id, "approve")} className="text-xs px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-semibold cursor-pointer transition-colors">Approve</button>
                          <button onClick={() => handleAction(t.id, "reject")} className="text-xs px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-semibold cursor-pointer transition-colors">Reject</button>
                        </div>
                      ) : (
                        <span className="text-xs text-navy-400 capitalize">{statusVal}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {timesheets.length === 0 && (
              <tr><td colSpan={canApprove ? 6 : 5} className="px-5 py-8 text-center text-navy-500">No timesheets found for this project.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
