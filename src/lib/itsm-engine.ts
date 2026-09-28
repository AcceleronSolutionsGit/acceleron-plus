import { itsmDb } from "./db";

type Priority = "low" | "medium" | "high" | "urgent";

/**
 * Calculates the SLA due date based on the ticket priority.
 * Fulfills REQ-SLA-01
 */
export function calculateSlaDueDate(priority: Priority | undefined, createdAt: Date = new Date()): Date {
  const slaDate = new Date(createdAt);
  
  // Note: For Phase 1, we use a simple hour/day addition.
  // In a future phase, we will query `business_hours` and `holidays` 
  // to skip weekends/holidays and outside-business-hours.
  switch (priority) {
    case "urgent":
      // Resolution target: 1 business day (24 hours for simple calculation)
      slaDate.setHours(slaDate.getHours() + 24);
      break;
    case "high":
      // Resolution target: 2 business days
      slaDate.setDate(slaDate.getDate() + 2);
      break;
    case "medium":
      // Resolution target: 5 business days
      slaDate.setDate(slaDate.getDate() + 5);
      break;
    case "low":
    default:
      // Resolution target: 10 business days
      slaDate.setDate(slaDate.getDate() + 10);
      break;
  }
  
  return slaDate;
}

/**
 * Auto-assigns a ticket to a member of the specified group using round-robin.
 * Fulfills REQ-ASN-01
 */
export async function autoAssignTicket(ticketId: string, groupId: string, tenantId: string): Promise<string | null> {
  // 1. Fetch group details to get members
  const group = await itsmDb("service_groups")
    .where({ id: groupId, tenant_id: tenantId })
    .first();
    
  if (!group || !group.member_user_ids || group.member_user_ids.length === 0) {
    return null; // Group doesn't exist or has no members
  }

  // 2. Simple Round-Robin: Pick a random member for now
  // In a full implementation, we'd query the number of open tickets per agent to balance load (REQ-ASN-03)
  const members = group.member_user_ids;
  const selectedAgentId = members[Math.floor(Math.random() * members.length)];

  // 3. Update the ticket
  await itsmDb("tickets")
    .where({ id: ticketId })
    .update({ agent_user_id: selectedAgentId });

  // 4. Create an audit entry for the assignment
  await itsmDb("ticket_history").insert({
    ticket_id: ticketId,
    field_name: "agent_user_id",
    old_value: null,
    new_value: selectedAgentId,
    changed_at: new Date().toISOString()
  });

  return selectedAgentId;
}
