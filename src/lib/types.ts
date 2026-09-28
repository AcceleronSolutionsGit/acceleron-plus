// ═══════════════════════════════════════════════════════════════════
// Acceleron Plus — Shared Types (DB-schema-aligned)
// ═══════════════════════════════════════════════════════════════════

// ─── identity_db ───────────────────────────────────────────────────

export interface UserRole {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "export";

export interface Permission {
  id: string;
  roleId: string;
  menuName: string;
  action: PermissionAction;
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  roleId?: string;
  role?: UserRole;
  mobilePhone?: string;
  avatarUrl?: string;
  darwinboxRef?: string;
  jobLevel?: string;
  officeLocation?: string;
  department?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  jwtId: string;
  ipAddress?: string;
  userAgent?: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

// ─── project_db ────────────────────────────────────────────────────

export type ProjectStatus = "initiated" | "planning" | "active" | "on_hold" | "closed" | "cancelled";

export interface Project {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  zohoAccountRef?: string;
  zohoSalesOrderRef?: string;
  sponsorUserId?: string;
  projectManagerUserId?: string;
  status: ProjectStatus;
  startDate?: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  description?: string;
  budgetInr?: number | string;
  clientCompanyName?: string;
  leadId?: string;
  createdAt: string;
  updatedAt: string;
  // Joined/computed
  projectManager?: User;
  sponsor?: User;
  currentPhase?: string;
  itsmContextId?: string;
  /** Every PM — the lead named on the project first, then the team PMs. */
  managers?: ProjectManagerRef[];
}

/** One of a project's PMs, as the Projects list shows them. */
export interface ProjectManagerRef {
  /** `emp:<employee id>`, or `user:<user id>` for an account with no employee record. */
  key: string;
  employeeId: string | null;
  userId: string | null;
  fullName: string;
  jobLevel: string | null;
  /** The lead PM named on the project row. */
  isLead: boolean;
}

/** Somebody who may be picked as a PM. */
export interface PmCandidate {
  key: string;
  employeeId: string | null;
  userId: string | null;
  fullName: string;
  email: string | null;
  jobLevel: string | null;
  designation: string | null;
  department: string | null;
  location: string | null;
}


export type WBSStatus = "not_started" | "in_progress" | "blocked" | "completed";

export interface WBSItem {
  id: string;
  projectId: string;
  parentWbsId?: string;
  code: string;
  name: string;
  description?: string;
  sequence: number;
  // Scheduling — drives the Gantt chart. Optional so that work packages
  // created before these columns existed still render.
  status?: WBSStatus;
  startDate?: string;
  endDate?: string;
  progressPercent?: number;
  estimatedHours?: number;
  ownerUserId?: string;
  // Rolled up from wbs_assignments — how many people are on this
  // package and how many hours they carry between them.
  assignedCount?: number;
  assignedHours?: number;
  createdAt: string;
  updatedAt: string;
  // Client-side tree
  children?: WBSItem[];
  level?: number;
}

export type MilestoneStatus = "pending" | "at_risk" | "completed" | "missed";

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  dueDate?: string;
  status: MilestoneStatus;
  completedAt?: string;
  ownerUserId?: string;
  isBillingMilestone?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RiskProbability = "low" | "medium" | "high";
export type RiskImpact = "low" | "medium" | "high";
export type RiskStatus = "open" | "mitigating" | "closed" | "accepted";

export interface Risk {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  probability?: RiskProbability;
  impact?: RiskImpact;
  status: RiskStatus;
  ownerUserId?: string;
  mitigationPlan?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  owner?: User;
}

export type GovernanceOutcome = "pass" | "conditional_pass" | "fail";

export interface GovernanceReview {
  id: string;
  projectId: string;
  reviewType: string;
  reviewDate: string;
  outcome?: GovernanceOutcome;
  notes?: string;
  createdAt: string;
}

// ─── itsm_db ───────────────────────────────────────────────────────

export type TicketType = "incident" | "service_request" | "problem" | "query";
export type TicketStatus = "new" | "open" | "pending" | "on_hold" | "resolved" | "closed" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Impact = "low" | "medium" | "high";
export type Urgency = "low" | "medium" | "high";

export interface Ticket {
  id: string;
  tenantId: string;
  ticketNumber: string;
  requesterId?: string;
  requestForIds?: string[];
  ticketType: TicketType;
  subject: string;
  description?: string;
  status: TicketStatus;
  companyId?: string;
  departmentId?: string;
  groupId?: string;
  categoryId?: string;
  subCategoryId?: string;
  itemId?: string;
  impactAreaId?: string;
  impact?: Impact;
  priority?: Priority;
  urgency?: Urgency;
  teamLeadUserId?: string;
  agentUserId?: string;
  subAgentUserId?: string;
  isOnHold: boolean;
  isOverdue: boolean;
  firstSeenAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  closerId?: string;
  closureComments?: string;
  rootCause?: string;
  correctiveAction?: string;
  lessonLearnt?: string;
  notes?: string;
  source?: string;
  tags?: string[];
  attachments?: Record<string, unknown>[];
  projectContextId?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  requester?: Requester;
  company?: Company;
  department?: Department;
  group?: ServiceGroup;
  agent?: User;
  category?: TaxonomyCategory;
  subCategory?: TaxonomySubCategory;
  item?: TaxonomyItem;
  projectCode?: string;
  projectName?: string;
  projectPhase?: string;
}

export interface TicketHistoryEntry {
  id: string;
  ticketId: string;
  changedByUserId?: string;
  fieldName: string;
  oldValue?: string;
  newValue?: string;
  changedAt: string;
  // Joined
  changedBy?: User;
}

export interface Requester {
  id: string;
  tenantId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyId?: string;
  departmentId?: string;
  mobilePhone?: string;
  workPhone?: string;
  address?: string;
  location?: string;
  language?: string;
  secondaryEmails?: string[];
  timeZone?: string;
  title?: string;
  isActive: boolean;
  reportingManagerId?: string;
  groupIds?: string[];
  sourceSystem?: "darwinbox" | "zoho" | "manual";
  sourceRefId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceGroup {
  id: string;
  tenantId: string;
  name: string;
  teamLeadUserId?: string;
  memberUserIds?: string[];
  businessHoursId?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxonomyCategory {
  id: string;
  tenantId: string;
  domain: string;
  impactAreaId?: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface TaxonomySubCategory {
  id: string;
  categoryId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface TaxonomyItem {
  id: string;
  subCategoryId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface ImpactArea {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export type ChangeRequestStatus = "draft" | "submitted" | "approved" | "rejected" | "in_progress" | "completed" | "closed";

export interface ChangeRequest {
  id: string;
  tenantId: string;
  changeNumber: string;
  companyId?: string;
  requesterIds?: string[];
  subject: string;
  changeType?: string;
  changeSubType?: string;
  status: ChangeRequestStatus;
  priority?: Priority;
  impact?: Impact;
  risk?: Impact;
  description?: string;
  planStartDate?: string;
  planEndDate?: string;
  reasonForChange?: string;
  rolloutPlan?: string;
  backoutPlan?: string;
  categoryId?: string;
  subCategoryId?: string;
  itemId?: string;
  departmentId?: string;
  impactAreaId?: string;
  subItems?: Record<string, unknown>[];
  attachments?: Record<string, unknown>[];
  relatedTicketNumbers?: string[];
  comments?: string;
  teamLeadUserId?: string;
  agentUserId?: string;
  groupId?: string;
  approverUserId?: string;
  approvalRequired: boolean;
  approvalVotes?: Record<string, unknown>[];
  releaseRequired: boolean;
  releaseVotes?: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
  // Joined
  company?: Company;
  group?: ServiceGroup;
  agent?: User;
  projectContextId?: string;
  projectCode?: string;
  projectName?: string;
}

export type ChangeTaskStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface ChangeTask {
  id: string;
  tenantId: string;
  taskNumber: string;
  title: string;
  changeRequestId?: string;
  groupId?: string;
  assignedByUserId?: string;
  assignedToUserId?: string;
  status: ChangeTaskStatus;
  notifyBeforeMinutes?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReleaseStatus = "planned" | "in_progress" | "completed" | "cancelled";

export interface Release {
  id: string;
  tenantId: string;
  releaseNumber: string;
  subject: string;
  description?: string;
  plannedStart?: string;
  plannedEnd?: string;
  status: ReleaseStatus;
  priority?: Priority;
  releaseType?: string;
  groupId?: string;
  agentUserId?: string;
  companyId?: string;
  departmentId?: string;
  categoryId?: string;
  changeRequestIds?: string[];
  associatedAssets?: Record<string, unknown>[];
  attachments?: Record<string, unknown>[];
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  group?: ServiceGroup;
  agent?: User;
}

export type EmailDirection = "inbound" | "outbound";

export interface Email {
  id: string;
  tenantId: string;
  ticketId?: string;
  ticketNumber?: string;
  direction: EmailDirection;
  sender: string;
  recipients?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  status?: string;
  graphMessageId?: string;
  threadRefs?: string[];
  createdAt: string;
}

// ─── Activity Timeline (unified view for ticket detail) ────────

export type ActivityType = "field_change" | "email_inbound" | "email_outbound" | "comment";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  timestamp: string;
  // For field_change
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy?: User;
  // For email
  sender?: string;
  recipients?: string[];
  subject?: string;
  body?: string;
  direction?: EmailDirection;
}

export interface ConsultantWorkloadItem {
  id: string;
  number: string;
  type: string;
  subject: string;
  status: string;
  priority?: string;
  companyName?: string;
  module?: string;
  createdAt: string;
}

// ─── PMT Expansion: Leads & Solutioning ────────────────────────────

export type LeadStatus = "new" | "qualifying" | "solutioning" | "proposal_sent" | "won" | "lost" | "on_hold";
export type LeadSource = "zoho_crm" | "manual" | "referral";

export interface Lead {
  id: string;
  tenantId: string;
  leadNumber: string;
  zohoCrmRef?: string;
  zohoCrmStage?: string;
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  opportunityValueInr?: number;
  currency: string;
  pmOwnerUserId?: string;
  pmOwner?: User;
  status: LeadStatus;
  source?: LeadSource;
  expectedCloseDate?: string;
  notes?: string;
  zohoSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SolutioningStatus = "draft" | "finalized";

export interface SolutioningSession {
  id: string;
  leadId: string;
  tenantId: string;
  sessionName: string;
  status: SolutioningStatus;
  riskBufferPercent: number;
  totalEffortDays: number;
  totalCostInr: number;
  totalAdditionalCostInr: number;
  proposedFeeInr: number;
  marginPercent: number;
  createdByUserId?: string;
  finalizedByUserId?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  lineItems?: SolutioningLineItem[];
  additionalCosts?: SolutioningAdditionalCost[];
}

export interface SolutioningLineItem {
  id: string;
  sessionId: string;
  phaseName: string;
  taskDescription: string;
  rateBandId?: string;
  rateBandName?: string;
  quantityResources: number;
  estimatedDays: number;
  dailyRateInr?: number;
  subtotalInr?: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface SolutioningAdditionalCost {
  id: string;
  sessionId: string;
  description: string;
  category?: "travel" | "software" | "hardware" | "other";
  amountInr: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
}

// ─── PMT Expansion: Employee Rate Bands ────────────────────────────

export interface EmployeeRateBand {
  id: string;
  tenantId: string;
  bandName: string;
  levelCode: string; // L1–L6
  dailyCostInr: number;
  dailyBillableRateInr?: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── PMT Expansion: Proposals ──────────────────────────────────────

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "revised";

export interface Proposal {
  id: string;
  tenantId: string;
  proposalNumber: string;
  leadId: string;
  solutioningSessionId?: string;
  title: string;
  status: ProposalStatus;
  version: string;
  coverNote?: string;
  executiveSummary?: string;
  scopeOfWork?: string;
  assumptions?: string;
  exclusions?: string;
  deliverables?: string;
  timelineNotes?: string;
  paymentTerms?: string;
  termsAndConditions?: string;
  pptUrl?: string;
  preparedByUserId?: string;
  sentAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  // Joined
  lead?: Lead;
  solutioningSession?: SolutioningSession;
}

// ─── PMT Expansion: Purchase Orders ────────────────────────────────

export type POStatus = "active" | "closed" | "cancelled";

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  proposalId: string;
  leadId?: string;
  poValueInr: number;
  currency: string;
  poDate: string;
  poExpiryDate?: string;
  clientCompanyName?: string;
  clientContactName?: string;
  clientContactEmail?: string;
  documentUrl?: string;
  status: POStatus;
  uploadedByUserId?: string;
  kickoffTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PMT Expansion: Team & Timesheets ──────────────────────────────

export interface ProjectTeamMember {
  id: string;
  projectId: string;
  userId: string;
  userName?: string;
  rateBandId?: string;
  rateBandName?: string;
  roleInProject?: string;
  allocationPercent: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined
  user?: User;
  rateBand?: EmployeeRateBand;
}

export type TimesheetStatus = "pending" | "approved" | "rejected";
export type TimesheetActivityType =
  | "discovery"
  | "design"
  | "development"
  | "testing"
  | "documentation"
  | "meeting"
  | "other";

export interface ProjectTimesheet {
  id: string;
  projectId: string;
  userId: string;
  userName?: string;
  wbsItemId?: string;
  wbsName?: string;
  logDate: string;
  hoursLogged: number;
  activityType: TimesheetActivityType;
  notes?: string;
  status: TimesheetStatus;
  approvedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PMT Expansion: Billing ────────────────────────────────────────

export type BillingMilestoneStatus = "pending" | "pm_confirmed" | "notified" | "invoiced" | "paid";

export interface BillingMilestone {
  id: string;
  projectId: string;
  milestoneId?: string;
  billingMilestoneName: string;
  billingAmountInr: number;
  billingPercent: number;
  status: BillingMilestoneStatus;
  currency: string;
  description?: string;
  dueDate?: string;
  pmConfirmedByUserId?: string;
  pmConfirmedAt?: string;
  notifiedAt?: string;
  zohoInvoiceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingNotification {
  id: string;
  billingMilestoneId: string;
  projectId: string;
  notificationType: "email" | "in_app";
  recipientType: "sales_team" | "finance" | "pm" | "client";
  recipientUserId?: string;
  recipientEmail?: string;
  message?: string;
  status: "sent" | "delivered" | "failed";
  sentAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PMT Expansion: Notifications ──────────────────────────────────

export type NotificationEventType =
  // Billing & pipeline
  | "milestone_billing_ready"
  | "po_received"
  | "proposal_accepted"
  | "magic_link_issued"
  | "lead_assigned"
  // Project lifecycle
  | "project_kickoff"
  | "project_status_changed"
  | "project_closed"
  | "phase_changed"
  // Plan: milestones & WBS
  | "milestone_created"
  | "milestone_completed"
  | "milestone_overdue"
  | "wbs_status_changed"
  | "deliverable_ready"
  // Risk & governance
  | "risk_raised"
  | "risk_escalated"
  | "stage_gate_recorded"
  | "stage_gate_failed"
  // ITSM
  | "ticket_linked"
  | "ticket_escalated"
  | "sla_breach"
  | "ticket_sla_breach"
  | "manual_update";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface ProjectNotification {
  id: string;
  tenantId: string;
  recipientUserId: string;
  /** The user whose action produced this notification, when there was one. */
  actorUserId?: string;
  eventType: NotificationEventType;
  severity?: NotificationSeverity;
  title: string;
  message?: string;
  projectId?: string;
  projectCode?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  isRead: boolean;
  readAt?: string;
  /** Set once an email for this notification has gone out. */
  emailSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PMT Expansion: Client Portal ──────────────────────────────────

export interface ProjectClientContact {
  id: string;
  projectId: string;
  name: string;
  email: string;
  designation?: string;
  phone?: string;
  isPrimary: boolean;
  canAccessPortal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientMagicLink {
  id: string;
  token: string;
  projectId: string;
  clientContactId?: string;
  clientEmail: string;
  expiresAt: string;
  usedAt?: string;
  isRevoked: boolean;
  issuedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PMT Expansion: Phase Reports ──────────────────────────────────

export type RAGStatus = "green" | "amber" | "red";

export interface PhaseReport {
  id: string;
  projectId: string;
  phaseName: string;
  reportDate: string;
  completionPercent: number;
  summary?: string;
  accomplishments?: string;
  upcomingWork?: string;
  blockers?: string;
  ragStatus: RAGStatus;
  openIssuesCount: number;
  closedIssuesCount: number;
  hoursLogged: number;
  budgetUtilizedPercent: number;
  preparedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── ITSM Expansion: Project Context & Time Logs ───────────────────

export interface ProjectContext {
  id: string;
  tenantId: string;
  projectDbId: string;
  projectCode: string;
  projectName: string;
  clientCompanyName?: string;
  pmUserId?: string;
  pmUserName?: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TimeLogActivityType =
  | "investigation"
  | "triage"
  | "resolution"
  | "testing"
  | "documentation"
  | "meeting"
  | "travel";

export type TimeLogStatus = "logged" | "approved" | "rejected";

export interface TimeLog {
  id: string;
  tenantId: string;
  ticketId?: string;
  ticketNumber?: string;
  changeRequestId?: string;
  changeNumber?: string;
  projectId?: string;
  projectCode?: string;
  userId: string;
  userName?: string;
  logDate: string;
  hoursLogged: number;
  activityType: TimeLogActivityType;
  notes?: string;
  status: TimeLogStatus;
  approvedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Cost Analysis (aggregated, privacy-safe) ──────────────────────

export interface CostByBand {
  rateBandName: string;
  levelCode: string;
  totalHours: number;
  totalDays: number;
  dailyRateInr: number;
  totalCostInr: number;
}

export interface CostByPhase {
  phaseName: string;
  totalHours: number;
  totalCostInr: number;
  budgetedCostInr: number;
  varianceInr: number;
  variancePercent: number;
}

export interface ProjectCostSummary {
  projectId: string;
  projectCode: string;
  budgetedFeeInr: number;
  totalCostInr: number;
  totalITSMHoursLogged: number;
  totalProjectHoursLogged: number;
  costByBand: CostByBand[];
  costByPhase: CostByPhase[];
  marginInr: number;
  marginPercent: number;
}

// ─── App-level user roles ───────────────────────────────────────────

export type AppRole = "admin" | "pm" | "member" | "client";

// ─── Project Document Vault ─────────────────────────────────────────

export type DocumentType =
  | "scope"
  | "solution_approach"
  | "sop"
  | "proposal"
  | "po"
  | "contract"
  | "sow"
  | "test_plan"
  | "meeting_minutes"
  | "phase_report"
  | "risk_register"
  | "other";

export type DocumentCategory =
  | "general"
  | "presales"
  | "delivery"
  | "legal"
  | "finance"
  | "governance";

export type DocumentAccessLevel = "team" | "pm_only" | "client_visible";

export interface ProjectDocument {
  id: string;
  tenantId: string;
  projectId: string;
  documentType: DocumentType;
  category: DocumentCategory;
  title: string;
  description?: string;
  version: string;
  tags?: string;
  fileName: string;
  storedFileName: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256?: string;
  accessLevel: DocumentAccessLevel;
  isActive: boolean;
  isLatestVersion: boolean;
  supersedesDocumentId?: string;
  uploadedByUserId: string;
  uploadedByName?: string;
  lastAccessedAt?: string;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAccessLog {
  id: string;
  documentId: string;
  projectId: string;
  userId: string;
  userName?: string;
  action: "view" | "download" | "upload" | "delete";
  ipAddress?: string;
  createdAt: string;
  updatedAt: string;
}

