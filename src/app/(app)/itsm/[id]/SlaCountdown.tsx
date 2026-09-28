"use client";

import React, { useState, useEffect } from "react";
import type { Ticket } from "@/lib/types";
import { slaTimeRemaining, cn } from "@/lib/utils";

/**
 * Live-updating SLA countdown badge.
 * Client Component — updates every second.
 */
export function SlaCountdown({ ticket }: { ticket: Ticket }) {
  // Use a mock SLA deadline (e.g., 4 hours from ticket creation for P1, 8h for P2, 24h for rest)
  const slaHours = ticket.priority === "urgent" ? 4 : ticket.priority === "high" ? 8 : 24;
  const deadline = new Date(new Date(ticket.createdAt).getTime() + slaHours * 3600000).toISOString();

  const [sla, setSla] = useState(() => slaTimeRemaining(deadline));

  useEffect(() => {
    const interval = setInterval(() => {
      setSla(slaTimeRemaining(deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-navy-500 uppercase tracking-wide">SLA</span>
      <div
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
          sla.isBreached
            ? "bg-red-800 text-white"
            : sla.isNearBreach
              ? "bg-red-600 text-white animate-pulse"
              : "bg-navy-900/5 text-navy-700"
        )}
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        {sla.text}
      </div>
      <span className="text-xs text-navy-500">
        ({slaHours}h SLA for {ticket.priority || "standard"} priority)
      </span>
    </div>
  );
}
