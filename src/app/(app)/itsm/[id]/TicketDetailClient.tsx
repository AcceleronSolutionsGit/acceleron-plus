"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Ticket, ActivityEntry, TicketStatus } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { ColorBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import {
  formatDate, formatDateTime, formatStatus, relativeTime,
  ticketStatusColor, ticketStatusDotColor, ticketStatusSolidColor,
  ticketTypeColor, ticketTypeDotColor, priorityColor, cn,
} from "@/lib/utils";
import { SlaCountdown } from "./SlaCountdown";
import { LogTimeWidget } from "./LogTimeWidget";
import { Modal } from "@/components/ui/Modal";

interface Props {
  ticket: Ticket;
  activity: ActivityEntry[];
}

interface AgentOption {
  id: string;
  email: string;
  fullName?: string;
  full_name?: string;
  jobLevel?: string;
  officeLocation?: string;
  department?: string;
}

const STATUS_CONFIG: Record<TicketStatus, {
  label: string;
  unselectedClass: string;
  selectedClass: string;
  dotClass: string;
  badgeClass: string;
  description: string;
}> = {
  new: {
    label: "New",
    unselectedClass: "bg-sky-50/70 border-sky-200 text-sky-900 hover:bg-sky-100 hover:border-sky-300",
    selectedClass: "bg-sky-600 border-sky-600 text-white shadow-md ring-2 ring-sky-300 ring-offset-1",
    dotClass: "bg-sky-500",
    badgeClass: "bg-sky-100 text-sky-800",
    description: "Logged & awaiting initial triage",
  },
  open: {
    label: "Open",
    unselectedClass: "bg-blue-50/70 border-blue-200 text-blue-900 hover:bg-blue-100 hover:border-blue-300",
    selectedClass: "bg-blue-600 border-blue-600 text-white shadow-md ring-2 ring-blue-300 ring-offset-1",
    dotClass: "bg-blue-500",
    badgeClass: "bg-blue-100 text-blue-800",
    description: "Assigned & actively worked on",
  },
  pending: {
    label: "Pending",
    unselectedClass: "bg-amber-50/70 border-amber-200 text-amber-950 hover:bg-amber-100 hover:border-amber-300",
    selectedClass: "bg-amber-600 border-amber-600 text-white shadow-md ring-2 ring-amber-300 ring-offset-1",
    dotClass: "bg-amber-500",
    badgeClass: "bg-amber-100 text-amber-900",
    description: "Awaiting customer or 3rd-party response",
  },
  on_hold: {
    label: "On Hold",
    unselectedClass: "bg-purple-50/70 border-purple-200 text-purple-900 hover:bg-purple-100 hover:border-purple-300",
    selectedClass: "bg-purple-600 border-purple-600 text-white shadow-md ring-2 ring-purple-300 ring-offset-1",
    dotClass: "bg-purple-500",
    badgeClass: "bg-purple-100 text-purple-800",
    description: "Temporarily blocked or paused",
  },
  resolved: {
    label: "Resolved",
    unselectedClass: "bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-300",
    selectedClass: "bg-emerald-600 border-emerald-600 text-white shadow-md ring-2 ring-emerald-300 ring-offset-1",
    dotClass: "bg-emerald-500",
    badgeClass: "bg-emerald-100 text-emerald-800",
    description: "Solution delivered to user",
  },
  closed: {
    label: "Closed",
    unselectedClass: "bg-slate-100/80 border-slate-300 text-slate-800 hover:bg-slate-200 hover:border-slate-400",
    selectedClass: "bg-slate-700 border-slate-700 text-white shadow-md ring-2 ring-slate-400 ring-offset-1",
    dotClass: "bg-slate-500",
    badgeClass: "bg-slate-200 text-slate-800",
    description: "Verified and finalized",
  },
  cancelled: {
    label: "Cancelled",
    unselectedClass: "bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100 hover:border-rose-300",
    selectedClass: "bg-rose-600 border-rose-600 text-white shadow-md ring-2 ring-rose-300 ring-offset-1",
    dotClass: "bg-rose-500",
    badgeClass: "bg-rose-100 text-rose-800",
    description: "Discarded, duplicate, or invalid",
  },
};

export function TicketDetailClient({ ticket, activity }: Props) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentTicket, setCurrentTicket] = useState<Ticket>(ticket);

  // Modals
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  // Assign state
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>(ticket.agentUserId || "");

  // Status state
  const [selectedStatus, setSelectedStatus] = useState<string>(ticket.status);
  const [statusComment, setStatusComment] = useState("");

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Comment / Attachment state
  const [commentText, setCommentText] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [localActivity, setLocalActivity] = useState(activity);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleUpdate = async (payload: any) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/itsm/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ticket) {
          setCurrentTicket(json.ticket);
        }
        showToast("Ticket updated successfully!");
        router.refresh();
      } else {
        alert("Failed to update ticket.");
      }
    } catch (err: any) {
      alert("Update error: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentText.trim() && commentFiles.length === 0) return;
    setIsPostingComment(true);
    try {
      const fd = new FormData();
      fd.append("comment", commentText.trim());
      commentFiles.forEach(f => fd.append("files", f));
      const res = await fetch(`/api/itsm/tickets/${ticket.id}/comment`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCommentText("");
        setCommentFiles([]);
        if (data.activity) setLocalActivity(prev => [...prev, data.activity]);
        showToast("Comment added");
        router.refresh();
      } else {
        alert(data.error || "Failed to post comment.");
      }
    } catch (err: any) {
      alert("Network error: " + err.message);
    } finally {
      setIsPostingComment(false);
    }
  };


  const openAssignModal = async () => {
    setIsAssignModalOpen(true);
    setSelectedAgentId(currentTicket.agentUserId || "");
    if (agents.length === 0) {
      setLoadingAgents(true);
      try {
        const res = await fetch("/api/itsm/agents");
        const data = await res.json();
        if (data.success && data.data) {
          setAgents(data.data);
        }
      } catch (err) {
        console.error("Failed to load agents", err);
      } finally {
        setLoadingAgents(false);
      }
    }
  };

  const confirmAssign = async (agentId: string | null, agentName?: string) => {
    await handleUpdate({ agent_user_id: agentId });
    setIsAssignModalOpen(false);
    showToast(agentId ? `Assigned to ${agentName || 'Agent'}` : "Ticket unassigned");
  };

  const openStatusModal = (preselected?: TicketStatus) => {
    setSelectedStatus(preselected || currentTicket.status);
    setStatusComment("");
    setIsStatusModalOpen(true);
  };

  const handleQuickStatus = async (newStatus: TicketStatus) => {
    if (newStatus === "resolved" || newStatus === "closed") {
      openStatusModal(newStatus);
      return;
    }
    const payload: any = { status: newStatus };
    await handleUpdate(payload);
    setSelectedStatus(newStatus);
    showToast(`Status updated to ${formatStatus(newStatus)}`);
  };

  const confirmStatusChange = async () => {
    const payload: any = { status: selectedStatus };
    if (selectedStatus === "resolved") payload.resolved_at = new Date().toISOString();
    if (selectedStatus === "closed") payload.closed_at = new Date().toISOString();
    if (statusComment.trim()) {
      payload.closure_comments = statusComment.trim();
    }
    await handleUpdate(payload);
    setIsStatusModalOpen(false);
    showToast(`Status changed to ${formatStatus(selectedStatus)}`);
  };

  const filteredAgents = agents.filter(a => {
    const name = (a.fullName || a.full_name || "").toLowerCase();
    const email = (a.email || "").toLowerCase();
    const loc = (a.officeLocation || "").toLowerCase();
    const lvl = (a.jobLevel || "").toLowerCase();
    const q = agentSearch.toLowerCase();
    return name.includes(q) || email.includes(q) || loc.includes(q) || lvl.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/itsm" className="text-navy-500 hover:text-navy-700 transition-colors">
          Tickets
        </Link>
        <span className="text-navy-500/40">›</span>
        <span className="text-navy-900 font-medium">{ticket.ticketNumber}</span>
      </div>

      {/* Header Card */}
      <Card padding="lg">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-navy-500">{ticket.ticketNumber}</span>
              
              {/* Clickable Color-Coded Status Badge */}
              <button
                type="button"
                onClick={() => openStatusModal()}
                title="Click to change ticket status"
                className={cn(
                  "inline-flex h-[24px] items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[11.5px] font-semibold transition-all hover:opacity-90 hover:shadow-xs cursor-pointer",
                  ticketStatusColor(currentTicket.status)
                )}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", ticketStatusDotColor(currentTicket.status))} />
                <span>{formatStatus(currentTicket.status)}</span>
                <svg className="w-3 h-3 opacity-60 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {ticket.priority && (
                <ColorBadge colorClass={priorityColor(ticket.priority)}>
                  {formatStatus(ticket.priority)}
                </ColorBadge>
              )}
              <span className={cn(
                "inline-flex h-[24px] items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[11.5px] font-semibold border shadow-2xs",
                ticketTypeColor(ticket.ticketType)
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", ticketTypeDotColor(ticket.ticketType))} />
                <span>{formatStatus(ticket.ticketType)}</span>
              </span>
              {ticket.isOverdue && (
                <Badge variant="critical">
                  <svg className="w-3 h-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Overdue
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              {ticket.subject}
            </h1>
            {ticket.description && (
              <p className="text-sm text-navy-700 max-w-2xl">{ticket.description}</p>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto mt-4 md:mt-0">
            {/* Quick Contextual Status Actions */}
            {currentTicket.status === "closed" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleQuickStatus("open")}
                disabled={isUpdating}
                className="text-blue-700 border-blue-200 hover:bg-blue-50"
              >
                ↺ Reopen Ticket
              </Button>
            )}
            {currentTicket.status === "resolved" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleQuickStatus("open")}
                  disabled={isUpdating}
                  className="text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  ↺ Reopen
                </Button>
                <Button
                  size="sm"
                  onClick={() => openStatusModal("closed")}
                  disabled={isUpdating}
                  className="bg-slate-700 hover:bg-slate-800 text-white"
                >
                  ✓ Close Ticket
                </Button>
              </>
            )}
            {currentTicket.status === "new" && (
              <Button
                size="sm"
                onClick={() => handleQuickStatus("open")}
                disabled={isUpdating}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                ▶ Start Work
              </Button>
            )}
            {currentTicket.status === "open" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openStatusModal("pending")}
                  disabled={isUpdating}
                  className="text-amber-800 border-amber-200 hover:bg-amber-50"
                >
                  ⏸ Mark Pending
                </Button>
                <Button
                  size="sm"
                  onClick={() => openStatusModal("resolved")}
                  disabled={isUpdating}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ✓ Resolve
                </Button>
              </>
            )}
            {(currentTicket.status === "pending" || currentTicket.status === "on_hold") && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleQuickStatus("open")}
                  disabled={isUpdating}
                  className="text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  ▶ Resume Work
                </Button>
                <Button
                  size="sm"
                  onClick={() => openStatusModal("resolved")}
                  disabled={isUpdating}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ✓ Resolve
                </Button>
              </>
            )}

            <Button variant="secondary" size="sm" onClick={openAssignModal} disabled={isUpdating} className="flex-1 md:flex-none justify-center">
              ↔ Transfer / Assign
            </Button>
            
            {/* Color-Coded Status Button */}
            <button
              type="button"
              onClick={() => openStatusModal()}
              disabled={isUpdating}
              className={cn(
                "inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-xs cursor-pointer",
                ticketStatusColor(currentTicket.status),
                "hover:brightness-95"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", ticketStatusDotColor(currentTicket.status))} />
              <span>Status: {formatStatus(currentTicket.status)}</span>
              <svg className="w-3.5 h-3.5 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* SLA Countdown (only show for non-resolved/closed) */}
        {!["resolved", "closed", "cancelled"].includes(currentTicket.status) && (
          <div className="mt-4 pt-4 border-t border-neutral-50">
            <SlaCountdown ticket={currentTicket} />
          </div>
        )}
      </Card>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Activity Timeline */}
        <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
          <Card title="Activity" padding="none">
            <div className="divide-y divide-neutral-50">
              {localActivity.length === 0 ? (
                <div className="px-5 py-12 text-center text-navy-500 text-sm">
                  No activity recorded yet
                </div>
              ) : (
                localActivity.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} />
                ))
              )}
            </div>
          </Card>

          {/* Comment + Attachment box */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-neutral-100">
              <span className="text-xs font-bold text-navy-700 uppercase tracking-wider">Add Comment / Attachment</span>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                rows={3}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Write a reply, note, or update for this ticket..."
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-700/20 resize-none"
              />

              {/* File picker */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="file" multiple className="sr-only"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp"
                    onChange={e => {
                      const picked = Array.from(e.target.files ?? []);
                      setCommentFiles(prev => {
                        const names = new Set(prev.map(f => f.name));
                        return [...prev, ...picked.filter(f => !names.has(f.name))];
                      });
                      e.target.value = "";
                    }}
                  />
                  <span className="text-xs font-medium text-navy-500 group-hover:text-navy-900 transition-colors flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    Attach files
                  </span>
                </label>
                {commentFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {commentFiles.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-navy-700 bg-navy-50 rounded px-2 py-1">
                        <span className="truncate flex-1">📄 {f.name}</span>
                        <span className="text-navy-400">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" onClick={() => setCommentFiles(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handlePostComment}
                  disabled={isPostingComment || (!commentText.trim() && commentFiles.length === 0)}
                >
                  {isPostingComment ? "Posting..." : "Post Comment"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Details Panel */}
        <div className="space-y-4 order-1 lg:order-2">
          <Card title="Details" padding="md">
            <div className="space-y-4">
              <DetailRow label="Requester" value={
                ticket.requester
                  ? `${ticket.requester.firstName} ${ticket.requester.lastName}`
                  : "—"
              } />
              <DetailRow label="Email" value={ticket.requester?.email || "—"} />
              <DetailRow label="Company" value={ticket.company?.name || "—"} />
              <DetailRow label="Department" value={ticket.department?.name || "—"} />
              <div className="border-t border-neutral-50 my-3" />
              <DetailRow label="Assigned Agent" value={ticket.agent?.fullName || "Unassigned"} />
              <DetailRow label="Group" value={ticket.group?.name || "—"} />
              <div className="border-t border-neutral-50 my-3" />
              <DetailRow label="Impact" value={ticket.impact ? formatStatus(ticket.impact) : "—"} />
              <DetailRow label="Urgency" value={ticket.urgency ? formatStatus(ticket.urgency) : "—"} />
              <DetailRow label="Source" value={ticket.source ? formatStatus(ticket.source) : "—"} />
              <div className="border-t border-neutral-50 my-3" />
              <DetailRow label="Created" value={formatDateTime(ticket.createdAt)} />
              <DetailRow label="Updated" value={formatDateTime(ticket.updatedAt)} />
              {ticket.resolvedAt && <DetailRow label="Resolved" value={formatDateTime(ticket.resolvedAt)} />}
              {ticket.closedAt && <DetailRow label="Closed" value={formatDateTime(ticket.closedAt)} />}
            </div>
          </Card>

          {ticket.tags && ticket.tags.length > 0 && (
            <Card title="Tags" padding="md">
              <div className="flex flex-wrap gap-2">
                {ticket.tags.map((tag) => (
                  <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Attachments */}
          <AttachmentsPanel ticket={ticket} />

          {ticket.projectContextId && (
            <LogTimeWidget ticketId={ticket.ticketNumber} projectId={ticket.projectContextId} />
          )}
        </div>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-navy-700">
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Assign Agent Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Ticket"
        footer={
          <div className="flex items-center justify-between w-full">
            {currentTicket.agentUserId ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                onClick={() => confirmAssign(null)}
                disabled={isUpdating}
              >
                Unassign Ticket
              </Button>
            ) : <div />}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAssignModalOpen(false)}
            >
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-navy-600">
            Select an agent or engineer to assign to <span className="font-semibold text-navy-900">{currentTicket.ticketNumber}</span>:
          </p>

          <input
            type="text"
            placeholder="Search agents by name or email..."
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-700/20"
          />

          {loadingAgents ? (
            <div className="py-8 text-center text-sm text-navy-500">Loading agents...</div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-neutral-100 border border-neutral-100 rounded-lg">
              {filteredAgents.length === 0 ? (
                <div className="py-6 text-center text-sm text-navy-400">No agents found</div>
              ) : (
                filteredAgents.map((ag) => {
                  const isCurrent = currentTicket.agentUserId === ag.id;
                  return (
                    <div
                      key={ag.id}
                      onClick={() => confirmAssign(ag.id, ag.fullName || ag.full_name)}
                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isCurrent ? "bg-navy-50/70 border-l-4 border-navy-900" : "hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={ag.fullName || ag.full_name || "Agent"} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-navy-900 truncate">
                              {ag.fullName || ag.full_name}
                            </p>
                            {ag.jobLevel && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                {ag.jobLevel}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-navy-500 truncate">
                            {ag.email} {ag.officeLocation ? `• ${ag.officeLocation}` : ""}
                          </p>
                        </div>
                      </div>
                      {isCurrent ? (
                        <span className="text-xs font-semibold text-navy-700 bg-navy-100 px-2 py-0.5 rounded">
                          Assigned
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-xs">
                          Assign
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Change Status Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Update Ticket Status"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsStatusModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmStatusChange}
              disabled={isUpdating}
              className={cn(
                ticketStatusSolidColor(selectedStatus as TicketStatus),
                "hover:brightness-95"
              )}
            >
              {isUpdating ? "Updating..." : `Save as ${formatStatus(selectedStatus)}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-2.5">
              Select Status
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {(["new", "open", "pending", "on_hold", "resolved", "closed", "cancelled"] as TicketStatus[]).map((st) => {
                const isSelected = selectedStatus === st;
                const isCurrent = currentTicket.status === st;
                const cfg = STATUS_CONFIG[st];

                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedStatus(st)}
                    className={cn(
                      "p-3 text-xs rounded-xl border text-left flex flex-col justify-between gap-1.5 transition-all cursor-pointer relative",
                      isSelected
                        ? cn(cfg.selectedClass, "shadow-md scale-[1.01]")
                        : cn(cfg.unselectedClass, "shadow-xs hover:scale-[1.01]")
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-2.5 h-2.5 rounded-full shrink-0 transition-transform",
                            isSelected ? "bg-white ring-2 ring-white/40" : cfg.dotClass
                          )}
                        />
                        <span className="font-bold text-sm tracking-tight">{cfg.label}</span>
                      </div>
                      {isSelected ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-white">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : isCurrent ? (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-navy-900/10 text-navy-700">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className={cn("text-[11px] leading-tight", isSelected ? "text-white/90" : "text-neutral-500")}>
                      {cfg.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1.5">
              Status Notes / Resolution Comments
            </label>
            <textarea
              rows={3}
              value={statusComment}
              onChange={(e) => setStatusComment(e.target.value)}
              placeholder={
                selectedStatus === "resolved" || selectedStatus === "closed"
                  ? "Describe the resolution, root cause, or closure verification..."
                  : "Add an optional note about why this status was changed..."
              }
              className="w-full text-sm rounded-lg border border-neutral-200 p-2.5 focus:border-navy-900 focus:outline-none transition-colors"
            />
            <p className="text-xs text-navy-400 mt-1">
              Notes are recorded in the ticket history and visible to stakeholders.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-medium text-navy-500 whitespace-nowrap">{label}</span>
      <span className="text-sm text-navy-900 text-right" suppressHydrationWarning>{value}</span>
    </div>
  );
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  if (entry.type === "email_inbound" || entry.type === "email_outbound") {
    const isInbound = entry.type === "email_inbound";
    return (
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-full ${isInbound ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-navy-900">
                {isInbound ? "Email received" : "Email sent"}
              </p>
              <span className="text-xs text-navy-500 tabular-nums">{relativeTime(entry.timestamp)}</span>
            </div>
            <div className="text-xs text-navy-500 mt-0.5 space-y-0.5">
              {isInbound
                ? <p>From: <span className="font-medium text-navy-700">{entry.sender}</span></p>
                : <p>To: <span className="font-medium text-navy-700">{entry.recipients?.join(", ")}</span></p>
              }
              {entry.ccRecipients && entry.ccRecipients.length > 0 && (
                <p>CC: <span className="font-medium text-navy-700">{entry.ccRecipients.join(", ")}</span></p>
              )}
              {entry.toRecipients && entry.toRecipients.length > 0 && (
                <p>To: <span className="font-medium text-navy-700">{entry.toRecipients.join(", ")}</span></p>
              )}
            </div>
            {entry.body && (
              <div className="mt-2 text-sm text-navy-700 bg-neutral-50 rounded-lg p-3 whitespace-pre-line">
                {entry.body}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Field change / note / creation
  const isCreation = entry.fieldName === "created";
  const isNote = entry.fieldName === "notes" || entry.fieldName === "comment";

  return (
    <div className={`px-5 py-3 ${isCreation ? "bg-emerald-50/40" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-1.5 rounded-full ${
          isCreation ? "bg-emerald-100 text-emerald-600" :
          isNote ? "bg-blue-50 text-blue-600" :
          "bg-navy-900/5 text-navy-500"
        }`}>
          {isCreation ? (
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : isNote ? (
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-navy-900">
              {isCreation ? (
                <span className="font-semibold text-emerald-700">✓ Ticket created</span>
              ) : isNote ? (
                <>
                  {entry.changedBy && <span className="font-medium">{entry.changedBy.fullName}</span>}
                  {" "}<span className="text-navy-600">added a note</span>
                </>
              ) : (
                <>
                  {entry.changedBy && <span className="font-medium">{entry.changedBy.fullName}</span>}
                  {" "}
                  <span>
                    changed <span className="font-medium">{formatStatus(entry.fieldName || "")}</span>
                    {entry.oldValue && <> from <span className="font-medium">{entry.oldValue}</span></>}
                    {entry.newValue && <> to <span className="font-medium text-navy-900">{entry.newValue}</span></>}
                  </span>
                </>
              )}
            </p>
            <span className="text-xs text-navy-500 tabular-nums flex-shrink-0">{relativeTime(entry.timestamp)}</span>
          </div>
          {isNote && entry.newValue && (
            <div className="mt-2 text-sm text-navy-700 bg-blue-50/50 border border-blue-100 rounded-lg p-3 whitespace-pre-line">
              {entry.newValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Attachments Panel ────────────────────────────────────────────────────────


function getAttachmentIcon(mimeType: string): React.ReactNode {
  if (mimeType === "application/pdf") {
    return (
      <div className="p-2 rounded-lg bg-red-50 text-red-600">
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  if (mimeType.startsWith("image/")) {
    return (
      <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  if (mimeType.includes("word")) {
    return (
      <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  return (
    <div className="p-2 rounded-lg bg-neutral-100 text-neutral-500">
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentsPanel({ ticket }: { ticket: Ticket }) {
  // Parse attachments from JSON column + table (already merged by getTicket)
  let attachments: any[] = [];
  try {
    if (Array.isArray(ticket.attachments)) {
      attachments = ticket.attachments;
    } else if (typeof ticket.attachments === "string") {
      attachments = JSON.parse(ticket.attachments as string);
    }
  } catch {
    attachments = [];
  }

  if (attachments.length === 0) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-navy-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-bold text-navy-700 uppercase tracking-wider">
          Attachments
        </span>
        <span className="ml-auto text-xs font-bold text-navy-400 bg-neutral-100 px-2 py-0.5 rounded-full">
          {attachments.length}
        </span>
      </div>
      <div className="divide-y divide-neutral-50">
        {attachments.map((att: any, i: number) => {
          // Portal-uploaded files: serve via /api/portal/files/[id]
          // Direct-uploaded files: serve via /api/itsm/tickets/[id]/attachments/[filename]
          const downloadUrl = att.portalServeId
            ? `/api/portal/files/${att.portalServeId}`
            : att.storedFileName
            ? `/api/itsm/tickets/${ticket.id}/attachments/${encodeURIComponent(att.storedFileName)}`
            : null;

          const isPreviewable = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain"].includes(att.mimeType || "");

          return (
            <div key={att.id || i} className="px-4 py-3 flex items-center gap-3 hover:bg-neutral-50/70 transition-colors group">
              {getAttachmentIcon(att.mimeType || "")}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy-900 truncate leading-tight">
                  {att.originalName || att.file_name || att.name || "Attachment"}
                </p>
                <p className="text-[11px] text-navy-400 mt-0.5">
                  {formatBytes(att.fileSizeBytes || att.file_size_bytes || att.size || 0)}
                  {att.uploadedAt && (
                    <span suppressHydrationWarning> · {formatDate(att.uploadedAt)}</span>
                  )}
                  {att.mimeType && (
                    <> · <span className="uppercase font-semibold">{att.mimeType.split("/").pop()}</span></>
                  )}
                </p>
              </div>

              {downloadUrl ? (
                <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                  {isPreviewable && (
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-navy-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                      title="Open in new tab"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  <a
                    href={downloadUrl}
                    download={att.originalName || att.file_name || "attachment"}
                    className="p-1.5 rounded-lg text-navy-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                </div>
              ) : (
                <span className="flex-shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  Pending save
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

