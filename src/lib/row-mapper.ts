import { mockUsers } from "./mock-data";
import type {
  Ticket,
  Requester,
  Company,
  Department,
  ServiceGroup,
  TaxonomyCategory,
  TaxonomySubCategory,
  TaxonomyItem,
  ChangeRequest,
  Release,
  Project,
  WBSItem,
  Milestone,
  Risk,
  GovernanceReview,
  User
} from "./types";

/** Convert snake_case string to camelCase */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/** Recursively convert object keys from snake_case to camelCase */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSnakeToCamel(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(mapSnakeToCamel);
  }

  const mappedObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    mappedObj[toCamelCase(key)] = mapSnakeToCamel(value);
  }
  return mappedObj;
}

function getUser(id: string | null | undefined, userMap?: Map<string, User>): User | undefined {
  if (!id) return undefined;
  if (userMap) {
    const user = userMap.get(id);
    if (user) return user;
  }
  return mockUsers.find(u => u.id === id);
}

// ─── ITSM Mappers ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTicketRow(row: any, userMap?: Map<string, User>): Ticket {
  const t = mapSnakeToCamel(row) as Ticket;
  
  // Attach joined user details using mock data or userMap
  if (row.requester_id) t.requester = mapSnakeToCamel({ 
    id: row.requester_id, 
    email: row.requester_email || '', 
    first_name: row.requester_first_name || '', 
    last_name: row.requester_last_name || ''
  }) as Requester;
  
  if (row.company_id) t.company = { id: row.company_id, name: row.company_name } as Company;
  if (row.department_id) t.department = { id: row.department_id, name: row.department_name } as Department;
  if (row.group_id) t.group = { id: row.group_id, name: row.group_name } as ServiceGroup;
  if (row.category_id) t.category = { id: row.category_id, name: row.category_name } as TaxonomyCategory;
  if (row.sub_category_id) t.subCategory = { id: row.sub_category_id, name: row.sub_category_name } as TaxonomySubCategory;
  if (row.item_id) t.item = { id: row.item_id, name: row.item_name } as TaxonomyItem;
  
  t.agent = getUser(row.agent_user_id, userMap);
  if (row.project_code) t.projectCode = row.project_code;
  if (row.project_name) t.projectName = row.project_name;
  if (row.project_phase) t.projectPhase = row.project_phase;
  
  return t;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapChangeRequestRow(row: any, userMap?: Map<string, User>): ChangeRequest {
  const cr = mapSnakeToCamel(row) as ChangeRequest;
  
  if (row.company_id) cr.company = { id: row.company_id, name: row.company_name } as Company;
  if (row.group_id) cr.group = { id: row.group_id, name: row.group_name } as ServiceGroup;
  cr.agent = getUser(row.agent_user_id, userMap);
  if (row.project_code) cr.projectCode = row.project_code;
  
  return cr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapReleaseRow(row: any, userMap?: Map<string, User>): Release {
  const r = mapSnakeToCamel(row) as Release;
  
  if (row.group_id) r.group = { id: row.group_id, name: row.group_name } as ServiceGroup;
  r.agent = getUser(row.agent_user_id, userMap);
  
  return r;
}

// ─── PMT Mappers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProjectRow(row: any, userMap?: Map<string, User>): Project {
  const p = mapSnakeToCamel(row) as Project;
  
  p.projectManager = getUser(row.project_manager_user_id, userMap);
  p.sponsor = getUser(row.sponsor_user_id, userMap);
  if (row.current_phase) p.currentPhase = row.current_phase;
  if (row.itsm_context_id) p.itsmContextId = row.itsm_context_id;
  
  return p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapWBSItemRow(row: any): WBSItem {
  return mapSnakeToCamel(row) as WBSItem;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMilestoneRow(row: any): Milestone {
  return mapSnakeToCamel(row) as Milestone;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRiskRow(row: any, userMap?: Map<string, User>): Risk {
  const r = mapSnakeToCamel(row) as Risk;
  r.owner = getUser(row.owner_user_id, userMap);
  return r;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapGovernanceReviewRow(row: any): GovernanceReview {
  return mapSnakeToCamel(row) as GovernanceReview;
}

// ─── PMT Expansion Mappers ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLeadRow(row: any) {
  const l = mapSnakeToCamel(row);
  return l;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSolutioningSessionRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSolutioningLineItemRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSolutioningAdditionalCostRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapEmployeeRateBandRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProposalRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProjectTeamMemberRow(row: any) {
  const m = mapSnakeToCamel(row);
  return m;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProjectTimesheetRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBillingMilestoneRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTimeLogRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProjectContextRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProjectNotificationRow(row: any) {
  return mapSnakeToCamel(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPhaseReportRow(row: any) {
  return mapSnakeToCamel(row);
}

