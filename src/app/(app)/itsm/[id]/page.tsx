import React from "react";
import { notFound } from "next/navigation";
import { getTicket, getTicketActivity } from "@/lib/api";
import { TicketDetailClient } from "./TicketDetailClient";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  const activity = await getTicketActivity(ticket.id);

  return <TicketDetailClient ticket={ticket} activity={activity} />;
}
