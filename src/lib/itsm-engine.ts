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
export async function autoAssignTicket(ticketId: string, groupId: string, tenantId?: string): Promise<string | null> {
  // 1. Fetch group details to get the team lead
  const query = itsmDb("service_groups").where({ id: groupId });
  if (tenantId) query.andWhere({ tenant_id: tenantId });
  const group = await query.first();
    
  if (!group || !group.team_lead_user_id) {
    return null; // Group doesn't exist or has no team lead
  }

  // 2. Assign to Team Lead as per user request
  const selectedAgentId = group.team_lead_user_id;

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
