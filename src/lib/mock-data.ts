// ═══════════════════════════════════════════════════════════════════
// Acceleron Plus — Mock Data (realistic, DB-schema-aligned)
// ═══════════════════════════════════════════════════════════════════

import type {
  User, UserRole, Project, WBSItem, Milestone, Risk, GovernanceReview,
  Ticket, TicketHistoryEntry, Requester, Company, Department,
  ServiceGroup, ChangeRequest, Release, Email, ActivityEntry,
} from "./types";

// ─── Tenant ────────────────────────────────────────────────────────
export const TENANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// ─── Roles ─────────────────────────────────────────────────────────
export const mockRoles: UserRole[] = [
  { id: "r-001", tenantId: TENANT_ID, code: "admin", name: "Administrator", description: "Full system access", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "r-002", tenantId: TENANT_ID, code: "project_manager", name: "Project Manager", description: "PMT module access", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "r-003", tenantId: TENANT_ID, code: "agent", name: "Service Desk Agent", description: "ITSM module access", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "r-004", tenantId: TENANT_ID, code: "viewer", name: "Viewer", description: "Read-only access", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
];

// ─── Users ─────────────────────────────────────────────────────────
export const mockUsers: User[] = [
  { id: "10000000-0000-0000-0000-000000000001", tenantId: TENANT_ID, email: "sabarnik@acceleronsolutions.com", fullName: "Sabarnik Lahiri", roleId: "r-001", role: mockRoles[0], isActive: true, mfaEnabled: false, lastLoginAt: "2026-08-18T08:30:00Z", createdAt: "2025-01-15T00:00:00Z", updatedAt: "2026-08-18T08:30:00Z" },
  { id: "20000000-0000-0000-0000-000000000002", tenantId: TENANT_ID, email: "priya.sharma@acceleronsolutions.com", fullName: "Priya Sharma", roleId: "r-002", role: mockRoles[1], isActive: true, mfaEnabled: true, lastLoginAt: "2026-08-17T14:00:00Z", createdAt: "2025-02-01T00:00:00Z", updatedAt: "2026-08-17T14:00:00Z" },
  { id: "30000000-0000-0000-0000-000000000003", tenantId: TENANT_ID, email: "arjun.mehta@acceleronsolutions.com", fullName: "Arjun Mehta", roleId: "r-003", role: mockRoles[2], isActive: true, mfaEnabled: false, lastLoginAt: "2026-08-18T09:00:00Z", createdAt: "2025-03-10T00:00:00Z", updatedAt: "2026-08-18T09:00:00Z" },
  { id: "40000000-0000-0000-0000-000000000004", tenantId: TENANT_ID, email: "neha.kapoor@acceleronsolutions.com", fullName: "Neha Kapoor", roleId: "r-002", role: mockRoles[1], isActive: true, mfaEnabled: false, lastLoginAt: "2026-08-16T10:00:00Z", createdAt: "2025-04-20T00:00:00Z", updatedAt: "2026-08-16T10:00:00Z" },
];

// ─── Companies ─────────────────────────────────────────────────────
export const mockCompanies: Company[] = [
  { id: "c0000000-0000-0000-0000-000000000001", tenantId: TENANT_ID, name: "Tata Consultancy Services", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "c0000000-0000-0000-0000-000000000002", tenantId: TENANT_ID, name: "Reliance Industries", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "c0000000-0000-0000-0000-000000000003", tenantId: TENANT_ID, name: "Infosys Limited", isActive: true, createdAt: "2025-02-15T00:00:00Z", updatedAt: "2025-02-15T00:00:00Z" },
];

// ─── Departments ───────────────────────────────────────────────────
export const mockDepartments: Department[] = [
  { id: "d0000000-0000-0000-0000-000000000001", companyId: "c0000000-0000-0000-0000-000000000001", name: "Engineering", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "d0000000-0000-0000-0000-000000000002", companyId: "c0000000-0000-0000-0000-000000000001", name: "Operations", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "d0000000-0000-0000-0000-000000000003", companyId: "c0000000-0000-0000-0000-000000000002", name: "IT Infrastructure", isActive: true, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "d0000000-0000-0000-0000-000000000004", companyId: "c0000000-0000-0000-0000-000000000003", name: "Digital Services", isActive: true, createdAt: "2025-02-15T00:00:00Z", updatedAt: "2025-02-15T00:00:00Z" },
];

// ─── Service Groups ────────────────────────────────────────────────
export const mockServiceGroups: ServiceGroup[] = [
  { id: "59000000-0000-0000-0000-000000000001", tenantId: TENANT_ID, name: "L1 Support", teamLeadUserId: "30000000-0000-0000-0000-000000000003", memberUserIds: ["30000000-0000-0000-0000-000000000003"], description: "First-level support", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "59000000-0000-0000-0000-000000000002", tenantId: TENANT_ID, name: "Infrastructure", teamLeadUserId: "30000000-0000-0000-0000-000000000003", memberUserIds: ["30000000-0000-0000-0000-000000000003"], description: "Infrastructure team", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
  { id: "59000000-0000-0000-0000-000000000003", tenantId: TENANT_ID, name: "Application Support", teamLeadUserId: "10000000-0000-0000-0000-000000000001", memberUserIds: ["10000000-0000-0000-0000-000000000001", "30000000-0000-0000-0000-000000000003"], description: "Application support team", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" },
];

// ─── Requesters ────────────────────────────────────────────────────
export const mockRequesters: Requester[] = [
  { id: "11100000-0000-0000-0000-000000000001", tenantId: TENANT_ID, email: "vijay.kumar@tcs.com", firstName: "Vijay", lastName: "Kumar", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000001", location: "Mumbai", isActive: true, createdAt: "2025-03-01T00:00:00Z", updatedAt: "2025-03-01T00:00:00Z" },
  { id: "11100000-0000-0000-0000-000000000002", tenantId: TENANT_ID, email: "anita.desai@reliance.com", firstName: "Anita", lastName: "Desai", companyId: "c0000000-0000-0000-0000-000000000002", departmentId: "d0000000-0000-0000-0000-000000000003", location: "Navi Mumbai", isActive: true, createdAt: "2025-03-15T00:00:00Z", updatedAt: "2025-03-15T00:00:00Z" },
  { id: "11100000-0000-0000-0000-000000000003", tenantId: TENANT_ID, email: "ravi.patel@infosys.com", firstName: "Ravi", lastName: "Patel", companyId: "c0000000-0000-0000-0000-000000000003", departmentId: "d0000000-0000-0000-0000-000000000004", location: "Bengaluru", isActive: true, createdAt: "2025-04-01T00:00:00Z", updatedAt: "2025-04-01T00:00:00Z" },
  { id: "11100000-0000-0000-0000-000000000004", tenantId: TENANT_ID, email: "suresh.nair@tcs.com", firstName: "Suresh", lastName: "Nair", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000002", location: "Chennai", isActive: true, createdAt: "2025-05-10T00:00:00Z", updatedAt: "2025-05-10T00:00:00Z" },
  { id: "11100000-0000-0000-0000-000000000005", tenantId: TENANT_ID, email: "meena.iyer@reliance.com", firstName: "Meena", lastName: "Iyer", companyId: "c0000000-0000-0000-0000-000000000002", departmentId: "d0000000-0000-0000-0000-000000000003", location: "Hyderabad", isActive: true, createdAt: "2025-06-01T00:00:00Z", updatedAt: "2025-06-01T00:00:00Z" },
];

// ─── Projects ──────────────────────────────────────────────────────
export const mockProjects: Project[] = [
  {
    id: "p-001", tenantId: TENANT_ID, code: "PRJ-2026-001", name: "ERP Migration — Phase 2",
    sponsorUserId: "10000000-0000-0000-0000-000000000001", projectManagerUserId: "20000000-0000-0000-0000-000000000002",
    status: "active", startDate: "2026-03-01", plannedEndDate: "2026-11-30",
    description: "Migrate legacy ERP system to cloud-native architecture. Phase 2 covers Finance and HR modules.",
    createdAt: "2026-02-15T00:00:00Z", updatedAt: "2026-08-15T10:00:00Z",
    projectManager: mockUsers[1], sponsor: mockUsers[0],
  },
  {
    id: "p-002", tenantId: TENANT_ID, code: "PRJ-2026-002", name: "SOC 2 Compliance Audit",
    sponsorUserId: "10000000-0000-0000-0000-000000000001", projectManagerUserId: "40000000-0000-0000-0000-000000000004",
    status: "active", startDate: "2026-05-01", plannedEndDate: "2026-09-30",
    description: "Achieve SOC 2 Type II compliance certification for cloud services.",
    createdAt: "2026-04-20T00:00:00Z", updatedAt: "2026-08-10T15:00:00Z",
    projectManager: mockUsers[3], sponsor: mockUsers[0],
  },
  {
    id: "p-003", tenantId: TENANT_ID, code: "PRJ-2026-003", name: "Customer Portal Redesign",
    projectManagerUserId: "20000000-0000-0000-0000-000000000002",
    status: "planning", startDate: "2026-09-01", plannedEndDate: "2027-02-28",
    description: "Complete redesign of the customer-facing support portal with self-service capabilities.",
    createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
    projectManager: mockUsers[1],
  },
  {
    id: "p-004", tenantId: TENANT_ID, code: "PRJ-2025-010", name: "Data Center Consolidation",
    projectManagerUserId: "40000000-0000-0000-0000-000000000004",
    status: "closed", startDate: "2025-06-01", plannedEndDate: "2026-03-31", actualEndDate: "2026-04-15",
    description: "Consolidate three regional data centers into two geo-redundant facilities.",
    createdAt: "2025-05-15T00:00:00Z", updatedAt: "2026-04-15T00:00:00Z",
    projectManager: mockUsers[3],
  },
  {
    id: "p-005", tenantId: TENANT_ID, code: "PRJ-2026-004", name: "ITSM Platform Rollout",
    projectManagerUserId: "20000000-0000-0000-0000-000000000002",
    status: "on_hold", startDate: "2026-06-15", plannedEndDate: "2026-12-31",
    description: "Implement new ITSM platform across all business units. On hold pending vendor negotiation.",
    createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z",
    projectManager: mockUsers[1],
  },
  {
    id: "p-006", tenantId: TENANT_ID, code: "PRJ-2026-005", name: "Zero Trust Network Implementation",
    projectManagerUserId: "40000000-0000-0000-0000-000000000004",
    status: "initiated", plannedEndDate: "2027-06-30",
    description: "Implement zero trust network architecture across all corporate locations.",
    createdAt: "2026-08-10T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z",
    projectManager: mockUsers[3],
  },
];

// ─── WBS Items ─────────────────────────────────────────────────────
export const mockWBSItems: WBSItem[] = [
  // Project p-001: ERP Migration
  { id: "wbs-001", projectId: "p-001", code: "1", name: "Discovery & Assessment", sequence: 1, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-002", projectId: "p-001", parentWbsId: "wbs-001", code: "1.1", name: "Current State Analysis", sequence: 1, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-003", projectId: "p-001", parentWbsId: "wbs-001", code: "1.2", name: "Gap Assessment", sequence: 2, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-004", projectId: "p-001", parentWbsId: "wbs-001", code: "1.3", name: "Stakeholder Interviews", sequence: 3, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-005", projectId: "p-001", code: "2", name: "Solution Design", sequence: 2, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-006", projectId: "p-001", parentWbsId: "wbs-005", code: "2.1", name: "Architecture Design", sequence: 1, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-007", projectId: "p-001", parentWbsId: "wbs-005", code: "2.2", name: "Data Migration Strategy", sequence: 2, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-008", projectId: "p-001", code: "3", name: "Development & Build", sequence: 3, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-009", projectId: "p-001", parentWbsId: "wbs-008", code: "3.1", name: "Finance Module Build", sequence: 1, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-010", projectId: "p-001", parentWbsId: "wbs-008", code: "3.2", name: "HR Module Build", sequence: 2, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-011", projectId: "p-001", code: "4", name: "Testing & UAT", sequence: 4, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "wbs-012", projectId: "p-001", code: "5", name: "Go-Live & Hypercare", sequence: 5, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
];

// ─── Milestones ────────────────────────────────────────────────────
export const mockMilestones: Milestone[] = [
  { id: "ms-001", projectId: "p-001", name: "Discovery Complete", dueDate: "2026-04-15", status: "completed", completedAt: "2026-04-12T00:00:00Z", createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-04-12T00:00:00Z" },
  { id: "ms-002", projectId: "p-001", name: "Solution Design Sign-off", dueDate: "2026-06-01", status: "completed", completedAt: "2026-06-03T00:00:00Z", createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-06-03T00:00:00Z" },
  { id: "ms-003", projectId: "p-001", name: "Development Sprint 1 Complete", dueDate: "2026-07-31", status: "missed", createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-08-05T00:00:00Z" },
  { id: "ms-004", projectId: "p-001", name: "UAT Start", dueDate: "2026-09-15", status: "at_risk", createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-08-15T00:00:00Z" },
  { id: "ms-005", projectId: "p-001", name: "Go-Live", dueDate: "2026-11-15", status: "pending", createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { id: "ms-006", projectId: "p-002", name: "Policy Review Complete", dueDate: "2026-06-30", status: "completed", completedAt: "2026-06-28T00:00:00Z", createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-06-28T00:00:00Z" },
  { id: "ms-007", projectId: "p-002", name: "Control Implementation", dueDate: "2026-08-15", status: "at_risk", createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z" },
  { id: "ms-008", projectId: "p-002", name: "Audit Readiness Assessment", dueDate: "2026-09-15", status: "pending", createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z" },
];

// ─── Risks ─────────────────────────────────────────────────────────
export const mockRisks: Risk[] = [
  { id: "rk-001", projectId: "p-001", title: "Key developer attrition", description: "Two senior developers may leave before Phase 2 completion", probability: "medium", impact: "high", status: "mitigating", ownerUserId: "20000000-0000-0000-0000-000000000002", mitigationPlan: "Cross-training program initiated; backup developers identified", createdAt: "2026-03-15T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", owner: mockUsers[1] },
  { id: "rk-002", projectId: "p-001", title: "Data quality issues in legacy system", description: "Finance module data has inconsistencies that may delay migration", probability: "high", impact: "high", status: "open", ownerUserId: "20000000-0000-0000-0000-000000000002", mitigationPlan: "Data cleansing sprint scheduled for Aug", createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", owner: mockUsers[1] },
  { id: "rk-003", projectId: "p-001", title: "Third-party API changes", description: "Payment gateway provider scheduled API v2 deprecation", probability: "low", impact: "medium", status: "accepted", ownerUserId: "10000000-0000-0000-0000-000000000001", createdAt: "2026-05-10T00:00:00Z", updatedAt: "2026-05-10T00:00:00Z", owner: mockUsers[0] },
  { id: "rk-004", projectId: "p-002", title: "Scope creep from new regulations", description: "Emerging DPDPA requirements may expand audit scope", probability: "medium", impact: "medium", status: "open", ownerUserId: "40000000-0000-0000-0000-000000000004", mitigationPlan: "Weekly regulatory watch meetings", createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-08-05T00:00:00Z", owner: mockUsers[3] },
  { id: "rk-005", projectId: "p-002", title: "Vendor audit tool compatibility", probability: "low", impact: "low", status: "closed", ownerUserId: "40000000-0000-0000-0000-000000000004", createdAt: "2026-06-15T00:00:00Z", updatedAt: "2026-07-10T00:00:00Z", owner: mockUsers[3] },
];

// ─── Governance Reviews ────────────────────────────────────────────
export const mockGovernanceReviews: GovernanceReview[] = [
  { id: "gr-001", projectId: "p-001", reviewType: "Stage Gate", reviewDate: "2026-04-20", outcome: "pass", notes: "Discovery phase completed satisfactorily. Proceed to solution design.", createdAt: "2026-04-20T00:00:00Z" },
  { id: "gr-002", projectId: "p-001", reviewType: "Stage Gate", reviewDate: "2026-06-10", outcome: "conditional_pass", notes: "Design approved with condition: data migration strategy needs peer review before build.", createdAt: "2026-06-10T00:00:00Z" },
  { id: "gr-003", projectId: "p-001", reviewType: "Risk Review", reviewDate: "2026-08-01", outcome: "fail", notes: "Sprint 1 missed deadline. Need remediation plan before continuing.", createdAt: "2026-08-01T00:00:00Z" },
  { id: "gr-004", projectId: "p-002", reviewType: "Steering Committee", reviewDate: "2026-07-15", outcome: "pass", notes: "Good progress on control implementation. Budget on track.", createdAt: "2026-07-15T00:00:00Z" },
];

// ─── Tickets ───────────────────────────────────────────────────────
const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600000).toISOString();

export const mockTickets: Ticket[] = [
  {
    id: "t-001", tenantId: TENANT_ID, ticketNumber: "INC-2026-0142", ticketType: "incident",
    subject: "Production database connection pool exhaustion", description: "Multiple microservices experiencing connection timeouts to PostgreSQL cluster. Affects order processing.",
    status: "open", priority: "urgent", impact: "high", urgency: "high",
    requesterId: "11100000-0000-0000-0000-000000000001", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000001", groupId: "59000000-0000-0000-0000-000000000002",
    agentUserId: "30000000-0000-0000-0000-000000000003", isOnHold: false, isOverdue: false,
    createdAt: hoursAgo(3), updatedAt: hoursAgo(1),
    requester: mockRequesters[0], company: mockCompanies[0], department: mockDepartments[0], group: mockServiceGroups[1], agent: mockUsers[2],
  },
  {
    id: "t-002", tenantId: TENANT_ID, ticketNumber: "INC-2026-0141", ticketType: "incident",
    subject: "SSO authentication failures for Reliance users", description: "Azure AD SAML integration returning 500 errors intermittently.",
    status: "pending", priority: "high", impact: "high", urgency: "medium",
    requesterId: "11100000-0000-0000-0000-000000000002", companyId: "c0000000-0000-0000-0000-000000000002", departmentId: "d0000000-0000-0000-0000-000000000003", groupId: "59000000-0000-0000-0000-000000000001",
    agentUserId: "30000000-0000-0000-0000-000000000003", isOnHold: false, isOverdue: true,
    createdAt: daysAgo(2), updatedAt: hoursAgo(6),
    requester: mockRequesters[1], company: mockCompanies[1], department: mockDepartments[2], group: mockServiceGroups[0], agent: mockUsers[2],
  },
  {
    id: "t-003", tenantId: TENANT_ID, ticketNumber: "SR-2026-0089", ticketType: "service_request",
    subject: "New VPN access for contractor team", description: "5 new contractors joining the data migration team need VPN access.",
    status: "open", priority: "medium", impact: "low", urgency: "medium",
    requesterId: "11100000-0000-0000-0000-000000000004", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000002", groupId: "59000000-0000-0000-0000-000000000002",
    agentUserId: "30000000-0000-0000-0000-000000000003", isOnHold: false, isOverdue: false,
    createdAt: daysAgo(1), updatedAt: hoursAgo(4),
    requester: mockRequesters[3], company: mockCompanies[0], department: mockDepartments[1], group: mockServiceGroups[1], agent: mockUsers[2],
  },
  {
    id: "t-004", tenantId: TENANT_ID, ticketNumber: "INC-2026-0140", ticketType: "incident",
    subject: "Email delivery delays — Exchange Online", description: "Outbound emails delayed by 15-30 minutes for all users.",
    status: "resolved", priority: "high", impact: "medium", urgency: "high",
    requesterId: "11100000-0000-0000-0000-000000000005", companyId: "c0000000-0000-0000-0000-000000000002", departmentId: "d0000000-0000-0000-0000-000000000003", groupId: "59000000-0000-0000-0000-000000000001",
    agentUserId: "30000000-0000-0000-0000-000000000003", isOnHold: false, isOverdue: false,
    resolvedAt: hoursAgo(2),
    createdAt: daysAgo(1), updatedAt: hoursAgo(2),
    requester: mockRequesters[4], company: mockCompanies[1], department: mockDepartments[2], group: mockServiceGroups[0], agent: mockUsers[2],
  },
  {
    id: "t-005", tenantId: TENANT_ID, ticketNumber: "SR-2026-0088", ticketType: "service_request",
    subject: "Software license procurement — Figma Enterprise", description: "Need 20 additional Figma Enterprise licenses for the design team.",
    status: "new", priority: "low", impact: "low", urgency: "low",
    requesterId: "11100000-0000-0000-0000-000000000003", companyId: "c0000000-0000-0000-0000-000000000003", departmentId: "d0000000-0000-0000-0000-000000000004", groupId: "59000000-0000-0000-0000-000000000003",
    isOnHold: false, isOverdue: false,
    createdAt: hoursAgo(1), updatedAt: hoursAgo(1),
    requester: mockRequesters[2], company: mockCompanies[2], department: mockDepartments[3], group: mockServiceGroups[2],
  },
  {
    id: "t-006", tenantId: TENANT_ID, ticketNumber: "PRB-2026-0012", ticketType: "problem",
    subject: "Recurring memory leak in payment gateway service", description: "Java heap space errors occurring every 48-72 hours requiring service restart.",
    status: "open", priority: "high", impact: "high", urgency: "medium",
    requesterId: "11100000-0000-0000-0000-000000000001", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000001", groupId: "59000000-0000-0000-0000-000000000003",
    agentUserId: "10000000-0000-0000-0000-000000000001", isOnHold: false, isOverdue: false,
    createdAt: daysAgo(5), updatedAt: daysAgo(1),
    requester: mockRequesters[0], company: mockCompanies[0], department: mockDepartments[0], group: mockServiceGroups[2], agent: mockUsers[0],
  },
  {
    id: "t-007", tenantId: TENANT_ID, ticketNumber: "INC-2026-0139", ticketType: "incident",
    subject: "Printer queue stuck — Floor 3", description: "Network printer on Floor 3 not accepting print jobs.",
    status: "closed", priority: "low", impact: "low", urgency: "low",
    requesterId: "11100000-0000-0000-0000-000000000004", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000002", groupId: "59000000-0000-0000-0000-000000000001",
    agentUserId: "30000000-0000-0000-0000-000000000003", isOnHold: false, isOverdue: false,
    resolvedAt: daysAgo(3), closedAt: daysAgo(2),
    createdAt: daysAgo(4), updatedAt: daysAgo(2),
    requester: mockRequesters[3], company: mockCompanies[0], department: mockDepartments[1], group: mockServiceGroups[0], agent: mockUsers[2],
  },
  {
    id: "t-008", tenantId: TENANT_ID, ticketNumber: "QRY-2026-0034", ticketType: "query",
    subject: "VPN configuration for macOS Sequoia", description: "Need guidance on setting up corporate VPN on macOS 16.",
    status: "resolved", priority: "low", impact: "low", urgency: "low",
    requesterId: "11100000-0000-0000-0000-000000000003", companyId: "c0000000-0000-0000-0000-000000000003", departmentId: "d0000000-0000-0000-0000-000000000004", groupId: "59000000-0000-0000-0000-000000000001",
    agentUserId: "30000000-0000-0000-0000-000000000003", isOnHold: false, isOverdue: false,
    resolvedAt: hoursAgo(5),
    createdAt: daysAgo(1), updatedAt: hoursAgo(5),
    requester: mockRequesters[2], company: mockCompanies[2], department: mockDepartments[3], group: mockServiceGroups[0], agent: mockUsers[2],
  },
  {
    id: "t-009", tenantId: TENANT_ID, ticketNumber: "INC-2026-0143", ticketType: "incident",
    subject: "Kubernetes pod crash loop — staging cluster", description: "Staging deployments failing with OOMKilled errors after recent helm chart update.",
    status: "new", priority: "medium", impact: "medium", urgency: "medium",
    requesterId: "11100000-0000-0000-0000-000000000001", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000001", groupId: "59000000-0000-0000-0000-000000000002",
    isOnHold: false, isOverdue: false,
    createdAt: hoursAgo(0.5), updatedAt: hoursAgo(0.5),
    requester: mockRequesters[0], company: mockCompanies[0], department: mockDepartments[0], group: mockServiceGroups[1],
  },
  {
    id: "t-010", tenantId: TENANT_ID, ticketNumber: "SR-2026-0090", ticketType: "service_request",
    subject: "Office 365 E5 license upgrade", description: "Upgrade 15 users from E3 to E5 for advanced compliance features.",
    status: "on_hold", priority: "medium", impact: "low", urgency: "low",
    requesterId: "11100000-0000-0000-0000-000000000005", companyId: "c0000000-0000-0000-0000-000000000002", departmentId: "d0000000-0000-0000-0000-000000000003", groupId: "59000000-0000-0000-0000-000000000003",
    agentUserId: "10000000-0000-0000-0000-000000000001", isOnHold: true, isOverdue: false,
    createdAt: daysAgo(3), updatedAt: daysAgo(1),
    requester: mockRequesters[4], company: mockCompanies[1], department: mockDepartments[2], group: mockServiceGroups[2], agent: mockUsers[0],
  },
  {
    id: "t-011", tenantId: TENANT_ID, ticketNumber: "INC-2026-0138", ticketType: "incident",
    subject: "API gateway rate limiting triggered incorrectly", description: "Legitimate API calls being throttled during business hours.",
    status: "open", priority: "high", impact: "medium", urgency: "high",
    requesterId: "11100000-0000-0000-0000-000000000001", companyId: "c0000000-0000-0000-0000-000000000001", departmentId: "d0000000-0000-0000-0000-000000000001", groupId: "59000000-0000-0000-0000-000000000003",
    agentUserId: "10000000-0000-0000-0000-000000000001", isOnHold: false, isOverdue: true,
    createdAt: daysAgo(3), updatedAt: daysAgo(1),
    requester: mockRequesters[0], company: mockCompanies[0], department: mockDepartments[0], group: mockServiceGroups[2], agent: mockUsers[0],
  },
  {
    id: "t-012", tenantId: TENANT_ID, ticketNumber: "SR-2026-0087", ticketType: "service_request",
    subject: "New employee onboarding — batch of 8", description: "Provision accounts, laptops, and access for 8 new hires starting Sept 1.",
    status: "open", priority: "medium", impact: "low", urgency: "medium",
    requesterId: "11100000-0000-0000-0000-000000000002", companyId: "c0000000-0000-0000-0000-000000000002", departmentId: "d0000000-0000-0000-0000-000000000003", groupId: "59000000-0000-0000-0000-000000000001",
    agentUserId: "30000000-0000-0000-0000-000000000003", isOnHold: false, isOverdue: false,
    createdAt: daysAgo(2), updatedAt: daysAgo(1),
    requester: mockRequesters[1], company: mockCompanies[1], department: mockDepartments[2], group: mockServiceGroups[0], agent: mockUsers[2],
  },
];

// ─── Ticket History (for t-001) ────────────────────────────────────
export const mockTicketHistory: TicketHistoryEntry[] = [
  { id: "th-001", ticketId: "t-001", changedByUserId: "30000000-0000-0000-0000-000000000003", fieldName: "status", oldValue: "new", newValue: "open", changedAt: hoursAgo(2.5), changedBy: mockUsers[2] },
  { id: "th-002", ticketId: "t-001", changedByUserId: "30000000-0000-0000-0000-000000000003", fieldName: "priority", oldValue: "high", newValue: "urgent", changedAt: hoursAgo(2), changedBy: mockUsers[2] },
  { id: "th-003", ticketId: "t-001", changedByUserId: "30000000-0000-0000-0000-000000000003", fieldName: "agent_user_id", newValue: "Arjun Mehta", changedAt: hoursAgo(2.5), changedBy: mockUsers[2] },
  { id: "th-004", ticketId: "t-001", changedByUserId: "10000000-0000-0000-0000-000000000001", fieldName: "notes", newValue: "Investigating connection pool settings. Current max_connections=100, active=98.", changedAt: hoursAgo(1.5), changedBy: mockUsers[0] },
  { id: "th-005", ticketId: "t-001", changedByUserId: "30000000-0000-0000-0000-000000000003", fieldName: "notes", newValue: "Increased pool size to 200. Monitoring for 30 minutes.", changedAt: hoursAgo(1), changedBy: mockUsers[2] },
];

// ─── Emails (for t-001) ───────────────────────────────────────────
export const mockEmails: Email[] = [
  { id: "em-001", tenantId: TENANT_ID, ticketId: "t-001", ticketNumber: "INC-2026-0142", direction: "inbound", sender: "vijay.kumar@tcs.com", recipients: ["support@acceleronsolutions.com"], subject: "Urgent: Database connection issues", body: "Hi Team,\n\nWe are experiencing intermittent connection failures to the production database. Multiple services are affected. Please investigate urgently.\n\nRegards,\nVijay", createdAt: hoursAgo(3) },
  { id: "em-002", tenantId: TENANT_ID, ticketId: "t-001", ticketNumber: "INC-2026-0142", direction: "outbound", sender: "support@acceleronsolutions.com", recipients: ["vijay.kumar@tcs.com"], subject: "Re: Urgent: Database connection issues [INC-2026-0142]", body: "Hi Vijay,\n\nWe have identified the issue — connection pool exhaustion due to a recent deployment. We are increasing pool limits now.\n\nWill update you within the hour.\n\nArjun Mehta\nService Desk", createdAt: hoursAgo(1.5) },
];

// ─── Activity Timeline (unified for ticket detail) ─────────────────
export function buildActivityTimeline(ticketId: string): ActivityEntry[] {
  const history = mockTicketHistory.filter((h) => h.ticketId === ticketId);
  const emails = mockEmails.filter((e) => e.ticketId === ticketId);

  const activities: ActivityEntry[] = [
    ...history.map((h) => ({
      id: h.id,
      type: "field_change" as const,
      timestamp: h.changedAt,
      fieldName: h.fieldName,
      oldValue: h.oldValue,
      newValue: h.newValue,
      changedBy: h.changedBy,
    })),
    ...emails.map((e) => ({
      id: e.id,
      type: (e.direction === "inbound" ? "email_inbound" : "email_outbound") as ActivityEntry["type"],
      timestamp: e.createdAt,
      sender: e.sender,
      recipients: e.recipients,
      subject: e.subject,
      body: e.body,
      direction: e.direction,
    })),
  ];

  return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Change Requests ───────────────────────────────────────────────
export const mockChangeRequests: ChangeRequest[] = [
  {
    id: "cr-001", tenantId: TENANT_ID, changeNumber: "CHG-2026-0045",
    subject: "Database connection pool increase — Production", status: "in_progress",
    changeType: "standard", priority: "urgent", impact: "high", risk: "medium",
    description: "Increase PostgreSQL connection pool from 100 to 200 connections to prevent exhaustion.",
    planStartDate: hoursAgo(1), planEndDate: hoursFromNow(2),
    companyId: "c0000000-0000-0000-0000-000000000001", groupId: "59000000-0000-0000-0000-000000000002", agentUserId: "30000000-0000-0000-0000-000000000003",
    approvalRequired: true, releaseRequired: false,
    createdAt: hoursAgo(2), updatedAt: hoursAgo(1),
    company: mockCompanies[0], group: mockServiceGroups[1], agent: mockUsers[2],
  },
  {
    id: "cr-002", tenantId: TENANT_ID, changeNumber: "CHG-2026-0044",
    subject: "Firewall rule update for new VPN subnet", status: "approved",
    changeType: "normal", priority: "medium", impact: "low", risk: "low",
    description: "Add new 10.20.0.0/16 subnet to corporate firewall for contractor VPN access.",
    planStartDate: hoursFromNow(24), planEndDate: hoursFromNow(26),
    companyId: "c0000000-0000-0000-0000-000000000001", groupId: "59000000-0000-0000-0000-000000000002", agentUserId: "30000000-0000-0000-0000-000000000003",
    approvalRequired: true, releaseRequired: false,
    createdAt: daysAgo(1), updatedAt: hoursAgo(4),
    company: mockCompanies[0], group: mockServiceGroups[1], agent: mockUsers[2],
  },
  {
    id: "cr-003", tenantId: TENANT_ID, changeNumber: "CHG-2026-0043",
    subject: "SSL certificate renewal — *.acceleronsolutions.com", status: "completed",
    changeType: "standard", priority: "high", impact: "high", risk: "low",
    description: "Renew and deploy wildcard SSL certificate before expiry.",
    companyId: "c0000000-0000-0000-0000-000000000001", groupId: "59000000-0000-0000-0000-000000000002", agentUserId: "10000000-0000-0000-0000-000000000001",
    approvalRequired: false, releaseRequired: false,
    createdAt: daysAgo(5), updatedAt: daysAgo(3),
    company: mockCompanies[0], group: mockServiceGroups[1], agent: mockUsers[0],
  },
  {
    id: "cr-004", tenantId: TENANT_ID, changeNumber: "CHG-2026-0042",
    subject: "Kubernetes cluster version upgrade to 1.30", status: "draft",
    changeType: "major", priority: "medium", impact: "high", risk: "high",
    description: "Upgrade all Kubernetes clusters from 1.28 to 1.30. Requires rolling restart.",
    planStartDate: hoursFromNow(72), planEndDate: hoursFromNow(80),
    groupId: "59000000-0000-0000-0000-000000000002", agentUserId: "30000000-0000-0000-0000-000000000003",
    approvalRequired: true, releaseRequired: true,
    createdAt: daysAgo(2), updatedAt: daysAgo(1),
    group: mockServiceGroups[1], agent: mockUsers[2],
  },
  {
    id: "cr-005", tenantId: TENANT_ID, changeNumber: "CHG-2026-0041",
    subject: "Azure AD conditional access policy update", status: "closed",
    changeType: "standard", priority: "medium", impact: "medium", risk: "low",
    description: "Enforce MFA for all admin portal access via conditional access policies.",
    companyId: "c0000000-0000-0000-0000-000000000002", groupId: "59000000-0000-0000-0000-000000000001", agentUserId: "30000000-0000-0000-0000-000000000003",
    approvalRequired: true, releaseRequired: false,
    createdAt: daysAgo(10), updatedAt: daysAgo(7),
    company: mockCompanies[1], group: mockServiceGroups[0], agent: mockUsers[2],
  },
];

// ─── Releases ──────────────────────────────────────────────────────
export const mockReleases: Release[] = [
  {
    id: "rel-001", tenantId: TENANT_ID, releaseNumber: "REL-2026-0015",
    subject: "Platform v3.2.0 — August Release", description: "Monthly platform release including bug fixes, performance improvements, and new ITSM features.",
    plannedStart: hoursFromNow(48), plannedEnd: hoursFromNow(52),
    status: "planned", priority: "high", releaseType: "minor",
    groupId: "59000000-0000-0000-0000-000000000003", agentUserId: "10000000-0000-0000-0000-000000000001",
    createdAt: daysAgo(5), updatedAt: daysAgo(1),
    group: mockServiceGroups[2], agent: mockUsers[0],
  },
  {
    id: "rel-002", tenantId: TENANT_ID, releaseNumber: "REL-2026-0014",
    subject: "Platform v3.1.2 — Hotfix", description: "Critical hotfix for payment gateway memory leak.",
    plannedStart: daysAgo(3), plannedEnd: daysAgo(3),
    status: "completed", priority: "urgent", releaseType: "hotfix",
    groupId: "59000000-0000-0000-0000-000000000003", agentUserId: "10000000-0000-0000-0000-000000000001",
    createdAt: daysAgo(4), updatedAt: daysAgo(3),
    group: mockServiceGroups[2], agent: mockUsers[0],
  },
  {
    id: "rel-003", tenantId: TENANT_ID, releaseNumber: "REL-2026-0016",
    subject: "Infrastructure — K8s 1.30 Rollout", description: "Coordinated Kubernetes cluster upgrade across all environments.",
    plannedStart: hoursFromNow(72), plannedEnd: hoursFromNow(96),
    status: "planned", priority: "medium", releaseType: "major",
    groupId: "59000000-0000-0000-0000-000000000002", agentUserId: "30000000-0000-0000-0000-000000000003",
    changeRequestIds: ["cr-004"],
    createdAt: daysAgo(2), updatedAt: daysAgo(1),
    group: mockServiceGroups[1], agent: mockUsers[2],
  },
];
