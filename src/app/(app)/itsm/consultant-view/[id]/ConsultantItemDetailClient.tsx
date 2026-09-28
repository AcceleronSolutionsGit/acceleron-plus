"use client";

import React from "react";
import Link from "next/link";
import type { Ticket, ActivityEntry, ChangeRequest } from "@/lib/types";
import { TicketDetailClient } from "../../[id]/TicketDetailClient";
import { Card } from "@/components/ui/Card";
import { ColorBadge } from "@/components/ui/Badge";
import { formatDateTime, ticketStatusColor, priorityColor, formatStatus } from "@/lib/utils";

interface Props {
  type: "ticket" | "change_request";
  ticket?: Ticket;
  activity?: ActivityEntry[];
  changeRequest?: ChangeRequest;
}

export function ConsultantItemDetailClient({ type, ticket, activity, changeRequest }: Props) {
  if (type === "ticket" && ticket && activity) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/itsm/consultant-view" className="text-navy-500 hover:text-navy-700 flex items-center gap-1 text-sm font-medium">
            <span>&larr;</span> Back to Workload
          </Link>
        </div>
        <TicketDetailClient ticket={ticket} activity={activity} />
      </div>
    );
  }

  if (type === "change_request" && changeRequest) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/itsm/consultant-view" className="text-navy-500 hover:text-navy-700 flex items-center gap-1 text-sm font-medium">
            <span>&larr;</span> Back to Workload
          </Link>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
                {changeRequest.subject}
              </h1>
              <ColorBadge colorClass={ticketStatusColor(changeRequest.status as any)}>
                {formatStatus(changeRequest.status)}
              </ColorBadge>
              {changeRequest.priority && (
                <ColorBadge colorClass={priorityColor(changeRequest.priority)}>
                  {changeRequest.priority} Priority
                </ColorBadge>
              )}
            </div>
            <p className="text-navy-500 font-mono text-sm">{changeRequest.changeNumber}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 border-neutral-50 shadow-sm rounded-xl">
              <h3 className="text-lg font-semibold text-navy-900 mb-4 font-[family-name:var(--font-league-spartan)]">Details</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-navy-500">Description</h4>
                  <p className="mt-1 text-sm text-navy-900">{changeRequest.description || "No description provided."}</p>
                </div>
                {changeRequest.reasonForChange && (
                  <div>
                    <h4 className="text-sm font-medium text-navy-500">Reason for Change</h4>
                    <p className="mt-1 text-sm text-navy-900">{changeRequest.reasonForChange}</p>
                  </div>
                )}
                {changeRequest.rolloutPlan && (
                  <div>
                    <h4 className="text-sm font-medium text-navy-500">Rollout Plan</h4>
                    <p className="mt-1 text-sm text-navy-900">{changeRequest.rolloutPlan}</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
          <div className="space-y-6">
            <Card className="p-6 space-y-4 border-neutral-50 shadow-sm rounded-xl">
              <h3 className="text-lg font-semibold text-navy-900 font-[family-name:var(--font-league-spartan)]">Properties</h3>
              
              <div className="space-y-3">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-navy-500">Type</span>
                  <span className="text-sm text-navy-900">{changeRequest.changeType || "—"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-navy-500">Impact</span>
                  <span className="text-sm text-navy-900">{changeRequest.impact || "—"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-navy-500">Risk</span>
                  <span className="text-sm text-navy-900">{changeRequest.risk || "—"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-navy-500">Planned Start</span>
                  <span className="text-sm text-navy-900">{changeRequest.planStartDate ? formatDateTime(changeRequest.planStartDate) : "—"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-navy-500">Planned End</span>
                  <span className="text-sm text-navy-900">{changeRequest.planEndDate ? formatDateTime(changeRequest.planEndDate) : "—"}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
