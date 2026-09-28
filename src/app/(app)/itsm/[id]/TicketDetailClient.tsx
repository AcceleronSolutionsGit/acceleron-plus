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
  formatDateTime, formatStatus, relativeTime,
  ticketStatusColor, priorityColor,
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

  const openStatusModal = () => {
    setSelectedStatus(currentTicket.status);
    setStatusComment("");
    setIsStatusModalOpen(true);
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
              <ColorBadge colorClass={ticketStatusColor(ticket.status)}>
                {formatStatus(ticket.status)}
              </ColorBadge>
              {ticket.priority && (
                <ColorBadge colorClass={priorityColor(ticket.priority)}>
                  {formatStatus(ticket.priority)}
                </ColorBadge>
              )}
              <ColorBadge colorClass="bg-navy-900/5 text-navy-700 border border-navy-500/20">
                {formatStatus(ticket.ticketType)}
              </ColorBadge>
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
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="secondary" size="sm" onClick={openAssignModal} disabled={isUpdating}>
              Assign
            </Button>
            <Button variant="secondary" size="sm" onClick={openStatusModal} disabled={isUpdating}>
              Change Status
            </Button>
          </div>
        </div>

        {/* SLA Countdown (only show for non-resolved/closed) */}
        {!["resolved", "closed", "cancelled"].includes(ticket.status) && (
          <div className="mt-4 pt-4 border-t border-neutral-50">
            <SlaCountdown ticket={ticket} />
          </div>
        )}
      </Card>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Activity Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Activity" padding="none">
            <div className="divide-y divide-neutral-50">
              {activity.length === 0 ? (
                <div className="px-5 py-12 text-center text-navy-500 text-sm">
                  No activity recorded yet
                </div>
              ) : (
                activity.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} />
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right: Details Panel */}
        <div className="space-y-4">
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
            >
              {isUpdating ? "Updating..." : "Save Status"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-2">
              Select Status
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(["new", "open", "pending", "on_hold", "resolved", "closed", "cancelled"] as TicketStatus[]).map((st) => {
                const isSelected = selectedStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedStatus(st)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? "border-navy-900 bg-navy-900 text-white shadow-sm"
                        : "border-neutral-200 bg-white text-navy-800 hover:bg-neutral-50"
                    }`}
                  >
                    <span>{formatStatus(st)}</span>
                    {isSelected && (
                      <svg className="w-3.5 h-3.5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
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
              placeholder="Add explanation for resolution, hold reason, or update details..."
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-700/20"
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
      <span className="text-sm text-navy-900 text-right">{value}</span>
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
            <p className="text-xs text-navy-500 mt-0.5">
              {isInbound ? `From: ${entry.sender}` : `To: ${entry.recipients?.join(", ")}`}
            </p>
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

  // Field change
  return (
    <div className="px-5 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded-full bg-navy-900/5 text-navy-500">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-navy-900">
              {entry.changedBy && (
                <span className="font-medium">{entry.changedBy.fullName}</span>
              )}
              {" "}
              {entry.fieldName === "notes" ? (
                <span>added a note</span>
              ) : (
                <span>
                  changed <span className="font-medium">{formatStatus(entry.fieldName || "")}</span>
                  {entry.oldValue && <> from <span className="font-medium">{entry.oldValue}</span></>}
                  {entry.newValue && <> to <span className="font-medium">{entry.newValue}</span></>}
                </span>
              )}
            </p>
            <span className="text-xs text-navy-500 tabular-nums flex-shrink-0">{relativeTime(entry.timestamp)}</span>
          </div>
          {entry.fieldName === "notes" && entry.newValue && (
            <div className="mt-2 text-sm text-navy-700 bg-neutral-50 rounded-lg p-3">
              {entry.newValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
