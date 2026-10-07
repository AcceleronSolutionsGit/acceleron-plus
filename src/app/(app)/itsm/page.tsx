import React from "react";
import { getTickets } from "@/lib/api";
import { getCurrentUser, getSession } from "@/lib/auth";
import { TicketQueueClient } from "./TicketQueueClient";
import { ComingSoonPlaceholder } from "@/components/layout/ComingSoonPlaceholder";

export default async function ITSMTicketsPage() {
  const [tickets, currentUser, session] = await Promise.all([
    getTickets(),
    getCurrentUser(),
    getSession(),
  ]);

  if (!["admin", "sales", "ticket_handler"].includes(session?.role || "")) {
    return <ComingSoonPlaceholder moduleName="Service Desk & Tickets" />;
  }

  return <TicketQueueClient tickets={tickets} currentUser={currentUser} />;
}
