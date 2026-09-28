"use server";

import { itsmDb, projectDb, identityDb } from "./db";
import {
  mapTicketRow,
  mapChangeRequestRow,
  mapReleaseRow,
  mapProjectRow,
  mapWBSItemRow,
  mapMilestoneRow,
  mapRiskRow,
  mapGovernanceReviewRow,
  mapSnakeToCamel
} from "./row-mapper";
import type {
  Project, Ticket, ChangeRequest, Release,
  WBSItem, Milestone, Risk, GovernanceReview,
  TicketHistoryEntry, ActivityEntry,
  User, ConsultantWorkloadItem,
} from "./types";
import { mockUsers, mockRequesters, mockCompanies, mockDepartments, mockServiceGroups } from "./mock-data";

// ─── Users & Employee Resolution ────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  try {
    const [users, employees] = await Promise.all([
      identityDb("users").select("*").catch(() => []),
      identityDb("employee_master").select("*").catch(() => []),
    ]);

    const empMap = new Map();
    employees.forEach((e: any) => {
      empMap.set(e.employee_id, e);
    });

    const userList: User[] = [];
    const seenEmails = new Set<string>();

    for (const u of users) {
      const emp = u.darwinbox_ref ? empMap.get(u.darwinbox_ref) : undefined;
      if (u.email) seenEmails.add(u.email.toLowerCase());
      userList.push({
        id: u.id,
        tenantId: u.tenant_id,
        email: u.email,
        fullName: u.full_name,
        roleId: u.role_id,
        isActive: u.is_active ?? true,
        mfaEnabled: false,
        darwinboxRef: u.darwinbox_ref,
        jobLevel: emp?.job_level,
        officeLocation: emp?.office_location,
        department: emp?.group_company_code,
        createdAt: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
        updatedAt: u.updated_at ? new Date(u.updated_at).toISOString() : new Date().toISOString(),
      });
    }

    // Also include any employees not yet in users table
    for (const emp of employees) {
      if (emp.company_email_id && !seenEmails.has(emp.company_email_id.toLowerCase())) {
        userList.push({
          id: emp.employee_id,
          tenantId: "10000000-0000-0000-0000-000000000001",
          email: emp.company_email_id,
          fullName: emp.full_name,
          isActive: true,
          mfaEnabled: false,
          darwinboxRef: emp.employee_id,
          jobLevel: emp.job_level,
          officeLocation: emp.office_location,
          department: emp.group_company_code,
          createdAt: emp.created_at ? new Date(emp.created_at).toISOString() : new Date().toISOString(),
          updatedAt: emp.updated_at ? new Date(emp.updated_at).toISOString() : new Date().toISOString(),
        });
      }
    }

    return userList.length > 0 ? userList : mockUsers;
  } catch (err) {
    console.error("Failed to fetch users:", err);
    return mockUsers;
  }
}

async function getUserMap(): Promise<Map<string, User>> {
  const users = await getUsers();
  const map = new Map<string, User>();
  users.forEach((u) => {
    map.set(u.id, u);
    if (u.darwinboxRef) map.set(u.darwinboxRef, u);
    if (u.email) map.set(u.email.toLowerCase(), u);
  });
  return map;
}

// ─── Lookup Data ───────────────────────────────────────────────────

export async function getRequesters() {
  const rows = await itsmDb("requesters").select("*");
  return rows.map(mapSnakeToCamel);
}

export async function getCompanies() {
  const rows = await itsmDb("companies").select("*");
  return rows.map(mapSnakeToCamel);
}

export async function getDepartments() {
  const rows = await itsmDb("departments").select("*");
  return rows.map(mapSnakeToCamel);
}

export async function getServiceGroups() {
  const rows = await itsmDb("service_groups").select("*");
  return rows.map(mapSnakeToCamel);
}

export async function getTaxonomyCategories() {
  const rows = await itsmDb("taxonomy_categories").where("is_active", true);
  return rows.map(mapSnakeToCamel);
}

export async function getTaxonomySubCategories() {
  const rows = await itsmDb("taxonomy_sub_categories").where("is_active", true);
  return rows.map(mapSnakeToCamel);
}

export async function getTaxonomyItems() {
  const rows = await itsmDb("taxonomy_items").where("is_active", true);
  return rows.map(mapSnakeToCamel);
}

export async function getImpactAreas() {
  const rows = await itsmDb("impact_areas").where("is_active", true);
  return rows.map(mapSnakeToCamel);
}

// ─── PMT: Projects ─────────────────────────────────────────────────

/**
 * Every live project.
 *
 * Scrapped projects are excluded here rather than at each call site —
 * this feeds the project list, the dashboards and the counts, and one
 * caller forgetting the filter is how a scrapped project reappears in
 * somebody's numbers. `getScrappedProjects` is the deliberate way in.
 */
export async function getProjects(): Promise<Project[]> {
  const [rows, contexts, userMap] = await Promise.all([
    projectDb("projects").whereNull("scrapped_at").select("*").orderBy("created_at", "desc"),
    itsmDb("project_contexts").select("*").catch(() => []),
    getUserMap(),
  ]);

  const ctxMap = new Map();
  contexts.forEach((c: any) => {
    if (c.project_db_id) ctxMap.set(c.project_db_id, c);
    if (c.project_code) ctxMap.set(c.project_code, c);
  });

  return rows.map((r: any) => {
    const p = mapProjectRow(r, userMap);
    const ctx = ctxMap.get(r.id) || ctxMap.get(r.code);
    if (ctx) {
      p.currentPhase = ctx.current_phase || "Discovery";
      p.itsmContextId = ctx.id;
    }
    return p;
  });
}

/**
 * The scrapped ones, most recently scrapped first.
 *
 * Deliberately a separate function rather than a flag on `getProjects`,
 * so nothing shows scrapped projects by accident — you have to ask.
 */
export async function getScrappedProjects(): Promise<
  (Project & {
    scrappedAt: string | null;
    scrappedByName: string | null;
    scrapReason: string | null;
  })[]
> {
  const [rows, userMap] = await Promise.all([
    projectDb("projects")
      .whereNotNull("scrapped_at")
      .select("*")
      .orderBy("scrapped_at", "desc"),
    getUserMap(),
  ]);

  return rows.map((r: any) => ({
    ...mapProjectRow(r, userMap),
    scrappedAt: r.scrapped_at ? new Date(r.scrapped_at).toISOString() : null,
    scrappedByName: r.scrapped_by_name ?? null,
    scrapReason: r.scrap_reason ?? null,
  }));
}

export async function getProject(idOrCode: string): Promise<Project | undefined> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrCode);
  const [row, userMap] = await Promise.all([
    projectDb("projects")
      .where(isUuid ? "id" : "code", idOrCode)
      .first(),
    getUserMap(),
  ]);
  if (!row) return undefined;

  const ctx = await itsmDb("project_contexts")
    .where("project_db_id", row.id)
    .orWhere("project_code", row.code)
    .first()
    .catch(() => null);

  const p = mapProjectRow(row, userMap);
  if (ctx) {
    p.currentPhase = ctx.current_phase || "Discovery";
    p.itsmContextId = ctx.id;
  }
  return p;
}

export async function getProjectWBS(projectId: string): Promise<WBSItem[]> {
  const rows = await projectDb("wbs_items")
    .where("project_id", projectId)
    .orderBy("sequence", "asc");
  return rows.map(mapWBSItemRow);
}

export async function getProjectMilestones(projectId: string): Promise<Milestone[]> {
  const rows = await projectDb("milestones")
    .where("project_id", projectId)
    .orderBy("due_date", "asc");
  return rows.map(mapMilestoneRow);
}

export async function getProjectRisks(projectId: string): Promise<Risk[]> {
  const [rows, userMap] = await Promise.all([
    projectDb("risks").where("project_id", projectId).orderBy("created_at", "desc"),
    getUserMap(),
  ]);
  return rows.map((r: any) => mapRiskRow(r, userMap));
}

export async function getProjectGovernanceReviews(projectId: string): Promise<GovernanceReview[]> {
  const rows = await projectDb("governance_reviews")
    .where("project_id", projectId)
    .orderBy("review_date", "desc");
  return rows.map(mapGovernanceReviewRow);
}

// ─── ITSM: Tickets ─────────────────────────────────────────────────

const TICKET_JOINS = (query: any) => {
  return query
    .leftJoin("requesters", "tickets.requester_id", "requesters.id")
    .leftJoin("companies", "tickets.company_id", "companies.id")
    .leftJoin("departments", "tickets.department_id", "departments.id")
    .leftJoin("service_groups", "tickets.group_id", "service_groups.id")
    .leftJoin("taxonomy_categories", "tickets.category_id", "taxonomy_categories.id")
    .leftJoin("taxonomy_sub_categories", "tickets.sub_category_id", "taxonomy_sub_categories.id")
    .leftJoin("taxonomy_items", "tickets.item_id", "taxonomy_items.id")
    .leftJoin("project_contexts", function (this: any) {
      this.on("tickets.project_context_id", "=", "project_contexts.id")
        .orOn("tickets.project_code", "=", "project_contexts.project_code");
    })
    .select(
      "tickets.*",
      "requesters.email as requester_email",
      "requesters.first_name as requester_first_name",
      "requesters.last_name as requester_last_name",
      "companies.name as company_name",
      "departments.name as department_name",
      "service_groups.name as group_name",
      "taxonomy_categories.name as category_name",
      "taxonomy_sub_categories.name as sub_category_name",
      "taxonomy_items.name as item_name",
      "project_contexts.project_code as project_code",
      "project_contexts.project_name as project_name",
      "project_contexts.current_phase as project_phase"
    );
};

export async function getTickets(filters?: { phase?: string; projectCode?: string }): Promise<Ticket[]> {
  let query = TICKET_JOINS(itsmDb("tickets"));
  if (filters?.phase) {
    query = query.where("project_contexts.current_phase", filters.phase);
  }
  if (filters?.projectCode) {
    query = query.where(function (this: any) {
      this.where("tickets.project_code", filters.projectCode)
        .orWhere("project_contexts.project_code", filters.projectCode);
    });
  }
  const [rows, userMap] = await Promise.all([
    query.orderBy("tickets.created_at", "desc"),
    getUserMap(),
  ]);
  return rows.map((r: any) => mapTicketRow(r, userMap));
}

export async function getTicket(idOrNumber: string): Promise<Ticket | undefined> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrNumber);
  const [row, userMap] = await Promise.all([
    TICKET_JOINS(itsmDb("tickets"))
      .where(isUuid ? "tickets.id" : "tickets.ticket_number", idOrNumber)
      .first(),
    getUserMap(),
  ]);
  return row ? mapTicketRow(row, userMap) : undefined;
}

export async function getTicketHistory(ticketId: string): Promise<TicketHistoryEntry[]> {
  const rows = await itsmDb("ticket_history")
    .where("ticket_id", ticketId)
    .orderBy("changed_at", "desc");
    
  return rows.map((row: any) => {
    const entry = mapSnakeToCamel(row) as TicketHistoryEntry;
    if (row.changed_by_user_id) {
      entry.changedBy = mockUsers.find(u => u.id === row.changed_by_user_id);
    }
    return entry;
  });
}

export async function getTicketActivity(ticketId: string): Promise<ActivityEntry[]> {
  const history = await getTicketHistory(ticketId);
  const emails = await itsmDb("emails").where("ticket_id", ticketId);
  
  const timeline: ActivityEntry[] = [];
  
  // Convert history entries to timeline items
  for (const h of history) {
    if (h.fieldName === "status" || h.fieldName === "priority" || h.fieldName === "agent_user_id" || h.fieldName === "group_id") {
      timeline.push({
        id: h.id,
        type: "field_change",
        timestamp: h.changedAt,
        fieldName: h.fieldName,
        oldValue: h.oldValue,
        newValue: h.newValue,
        changedBy: h.changedBy
      });
    } else if (h.fieldName === "comment") { // Assuming comments are saved as history entries for now
      timeline.push({
        id: h.id,
        type: "comment",
        timestamp: h.changedAt,
        body: h.newValue,
        changedBy: h.changedBy
      });
    }
  }
  
  // Convert email entries
  for (const e of emails) {
    const isOutbound = e.direction === "outbound";
    timeline.push({
      id: e.id,
      type: isOutbound ? "email_outbound" : "email_inbound",
      timestamp: e.created_at,
      sender: e.sender,
      recipients: e.recipients,
      subject: e.subject,
      body: e.body,
      direction: e.direction as any
    });
  }
  
  return timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── ITSM: Change Requests ────────────────────────────────────────

const CR_JOINS = (query: any) => {
  return query
    .leftJoin("companies", "change_requests.company_id", "companies.id")
    .leftJoin("service_groups", "change_requests.group_id", "service_groups.id")
    .select(
      "change_requests.*",
      "companies.name as company_name",
      "service_groups.name as group_name"
    );
};

export async function getChangeRequests(): Promise<ChangeRequest[]> {
  const [rows, userMap] = await Promise.all([
    CR_JOINS(itsmDb("change_requests")).orderBy("change_requests.created_at", "desc"),
    getUserMap(),
  ]);
  return rows.map((r: any) => mapChangeRequestRow(r, userMap));
}

export async function getChangeRequest(idOrNumber: string): Promise<ChangeRequest | undefined> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrNumber);
  const [row, userMap] = await Promise.all([
    CR_JOINS(itsmDb("change_requests"))
      .where(isUuid ? "change_requests.id" : "change_requests.change_number", idOrNumber)
      .first(),
    getUserMap(),
  ]);
  return row ? mapChangeRequestRow(row, userMap) : undefined;
}

// ─── Consultant View ───────────────────────────────────────────────

export async function getConsultants(): Promise<User[]> {
  return getUsers();
}

export async function getConsultantWorkload(
  agentUserId: string,
  startDate?: string,
  endDate?: string
): Promise<ConsultantWorkloadItem[]> {
  const userMap = await getUserMap();
  // 1. Fetch tickets assigned to this agent
  let ticketsQuery = TICKET_JOINS(itsmDb("tickets")).where("tickets.agent_user_id", agentUserId);
  let crsQuery = CR_JOINS(itsmDb("change_requests")).where("change_requests.agent_user_id", agentUserId);
  
  if (startDate) {
    ticketsQuery = ticketsQuery.where("tickets.created_at", ">=", startDate);
    crsQuery = crsQuery.where("change_requests.created_at", ">=", startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const endStr = end.toISOString();
    ticketsQuery = ticketsQuery.where("tickets.created_at", "<=", endStr);
    crsQuery = crsQuery.where("change_requests.created_at", "<=", endStr);
  }
  
  const [ticketRows, crRows] = await Promise.all([ticketsQuery, crsQuery]);
  const tickets = ticketRows.map((r: any) => mapTicketRow(r, userMap));
  const crs = crRows.map((r: any) => mapChangeRequestRow(r, userMap));

  const workload: ConsultantWorkloadItem[] = [];

  tickets.forEach((t: Ticket) => {
    workload.push({
      id: t.id,
      number: t.ticketNumber,
      type: t.ticketType,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      companyName: t.company?.name,
      module: t.category?.name,
      createdAt: t.createdAt,
    });
  });

  crs.forEach((c: ChangeRequest) => {
    workload.push({
      id: c.id,
      number: c.changeNumber,
      type: "Change Request",
      subject: c.subject,
      status: c.status,
      priority: c.priority,
      companyName: c.company?.name,
      module: undefined, 
      createdAt: c.createdAt,
    });
  });

  return workload.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ─── ITSM: Releases ───────────────────────────────────────────────

const RELEASE_JOINS = (query: any) => {
  return query
    .leftJoin("service_groups", "releases.group_id", "service_groups.id")
    .select(
      "releases.*",
      "service_groups.name as group_name"
    );
};

export async function getReleases(): Promise<Release[]> {
  const [rows, userMap] = await Promise.all([
    RELEASE_JOINS(itsmDb("releases")).orderBy("releases.created_at", "desc"),
    getUserMap(),
  ]);
  return rows.map((r: any) => mapReleaseRow(r, userMap));
}

export async function getRelease(id: string): Promise<Release | undefined> {
  const [row, userMap] = await Promise.all([
    RELEASE_JOINS(itsmDb("releases")).where("releases.id", id).first(),
    getUserMap(),
  ]);
  return row ? mapReleaseRow(row, userMap) : undefined;
}

