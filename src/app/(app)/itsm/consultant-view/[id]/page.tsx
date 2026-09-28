import { notFound } from "next/navigation";
import { getTicket, getTicketActivity, getChangeRequest } from "@/lib/api";
import { ConsultantItemDetailClient } from "./ConsultantItemDetailClient";

export default async function ConsultantItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Try fetching as ticket first
  const ticket = await getTicket(id);
  if (ticket) {
    const activity = await getTicketActivity(ticket.id);
    return <ConsultantItemDetailClient type="ticket" ticket={ticket} activity={activity} />;
  }

  // Try fetching as change request
  const changeRequest = await getChangeRequest(id);
  if (changeRequest) {
    return <ConsultantItemDetailClient type="change_request" changeRequest={changeRequest} />;
  }

  // If neither, return 404
  notFound();
}
