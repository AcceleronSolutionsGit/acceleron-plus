// ═══════════════════════════════════════════════════════════════
// The walkthroughs.
//
// Each step points at something that is really on the screen, by the
// `data-guide` attribute on the element rather than by a CSS class —
// a class is a styling decision and will be changed by somebody who
// has no idea a tour depends on it.
//
// Every guide is written for one role, in that role's language, and
// describes a job somebody actually has to do rather than a tour of
// the menus. "Staff a project without double-booking anyone" is a
// task; "the Team tab" is not.
// ═══════════════════════════════════════════════════════════════

import type { AppRole } from "./types";
import { PHASE2_PAGES, isPhase1Restricted, matchesPrefix } from "./rollout";

export interface GuideStep {
  title: string;
  body: string;
  /**
   * The `data-guide` value of the element to point at. Prefix with
   * `css:` to use a raw selector instead. Leave it out for a step that
   * is just something to read.
   */
  target?: string;
  /** The page this step lives on. The tour navigates there itself. */
  path?: string;
  /** The thing to do, phrased as an instruction. */
  action?: string;
  /** Doing the thing moves the tour on, rather than pressing Next. */
  advanceOnAction?: boolean;
}

export interface Guide {
  id: string;
  title: string;
  summary: string;
  /** Roughly how long it takes, in minutes. */
  minutes: number;
  roles: AppRole[];
  /** Where the tour begins. */
  path: string;
  group: string;
  steps: GuideStep[];
}

export const GUIDES: Guide[] = [
  // ─── Everyone ───────────────────────────────────────────────
  {
    id: "orientation",
    title: "Find your way around",
    summary: "The sidebar, the trail at the top, and where your own work lives.",
    minutes: 1,
    roles: ["admin", "pm", "member"],
    path: "/my-projects",
    group: "Getting started",
    steps: [
      {
        title: "Welcome to Acceleron Plus",
        body: "Everything the practice runs on lives here — delivery, the service desk, staffing and margin. This takes a minute and you can leave at any point with Escape.",
      },
      {
        title: "Your projects",
        body: "My Projects is where you add yourself to the projects you work on — search for one, pick your role and how much of your week it takes. Your reporting manager reviews it afterwards.",
        target: "nav:/my-projects",
        path: "/my-projects",
      },
      {
        title: "Your hours",
        body: "My Timesheet is one week at a time, showing only the projects you are on — a project appears here as soon as you add it.",
        target: "nav:/my-timesheet",
      },
      {
        title: "Your skills",
        body: "Keep these current. It is how you get found when somebody is staffing a project that needs what you can do.",
        target: "nav:/my-skills",
      },
      {
        title: "Where you are",
        body: "The trail at the top always says where you are, and every step but the last is a link back.",
        target: "css:nav[aria-label='Breadcrumb']",
      },
      {
        title: "This button, whenever you need it",
        body: "Guide is here on every page. Open it and pick a walkthrough for whatever you are trying to do.",
        target: "guide:launcher",
      },
    ],
  },

  // ─── Delivery ───────────────────────────────────────────────
  {
    id: "create-project",
    title: "Start a new project",
    summary: "Create it, then build out the plan on the timeline.",
    minutes: 3,
    roles: ["admin", "pm"],
    path: "/pmt",
    group: "Delivery",
    steps: [
      {
        title: "Open the project list",
        body: "Everything in delivery starts here.",
        target: "nav:/pmt",
        path: "/pmt",
      },
      {
        title: "Create it",
        body: "Give it a name, the client, the dates and the budget. The code is allocated for you.",
        target: "project:new",
        action: "Click New Project",
        advanceOnAction: true,
      },
      {
        title: "Open the project",
        body: "Click any row to open it. Everything about a project lives behind these tabs.",
        target: "css:tbody tr",
      },
      {
        title: "Build the plan",
        body: "The Gantt is editable — drag a bar to move it, drag its edge to resize it, and drag on the empty row at the bottom to add a work package.",
        target: "tab:gantt",
      },
      {
        title: "Then staff it",
        body: "Team & Resources is where people and rates go. The next guide covers that.",
        target: "tab:team",
      },
    ],
  },
  {
    id: "staff-project",
    title: "Staff a project without double-booking anyone",
    summary:
      "Add people, let their rate band come from their grade, and read the clash warning.",
    minutes: 3,
    roles: ["admin", "pm"],
    path: "/pmt",
    group: "Delivery",
    steps: [
      {
        title: "Open a project",
        body: "Pick the project you are staffing.",
        target: "css:tbody tr",
        path: "/pmt",
      },
      {
        title: "Team & Resources",
        body: "Everyone on the project, what they cost, and what they are billed at.",
        target: "tab:team",
        action: "Open the Team tab",
        advanceOnAction: true,
      },
      {
        title: "The rate band fills itself in",
        body:
          "Pick a person and their band comes from their Darwinbox grade. You can override it, but the default is the company's own rate card rather than a number somebody typed.",
      },
      {
        title: "Watch for the clash warning",
        body:
          "If somebody is already committed elsewhere over the same dates, you get told before you save — with which projects and at what percentage. Closed projects are not counted.",
      },
      {
        title: "Check the whole picture afterwards",
        body:
          "Resource Allocation shows everyone across every project at once, so you can see who you have just pushed over 100%.",
        target: "nav:/admin/allocations",
      },
    ],
  },
  {
    id: "margin",
    title: "Set a margin and price the team to it",
    summary: "Record what the project should earn, then rewrite the rates to hit it.",
    minutes: 2,
    roles: ["admin", "pm"],
    path: "/pmt",
    group: "Delivery",
    steps: [
      {
        title: "Open a project",
        body: "Margin is set per project, by whoever runs it.",
        target: "css:tbody tr",
        path: "/pmt",
      },
      {
        title: "Financials",
        body: "Margin sits at the top of this tab.",
        target: "tab:financials",
        action: "Open the Financials tab",
        advanceOnAction: true,
      },
      {
        title: "Three different numbers",
        body:
          "Target is what you committed to. Planned is what the staffing implies. Actual is what the hours logged have earned. The variance is in percentage points — four points under is not the same statement as four per cent under.",
      },
      {
        title: "Pricing to the target",
        body:
          "Price the team to it rewrites each person's billable rate from their own cost, so the margin is even across the team rather than one grade subsidising another. Cost is never touched — what somebody costs is a fact.",
      },
      {
        title: "It is a separate button on purpose",
        body:
          "Saving a target records an aim. Repricing changes live rates. Doing the second silently when you meant the first would be an unpleasant surprise on a running project.",
      },
    ],
  },
  {
    id: "lead-pipeline",
    title: "Run a deal from lead to project",
    summary: "Move a card along the pipeline, build an estimate, convert it when it is won.",
    minutes: 3,
    roles: ["admin", "pm"],
    path: "/pmt/leads",
    group: "Delivery",
    steps: [
      {
        title: "Leads & Pipeline",
        body: "Everything before a project exists.",
        target: "pmt-tab:/pmt/leads",
        path: "/pmt/leads",
      },
      {
        title: "Add a lead",
        body: "It starts in New Leads.",
        target: "lead:new",
        action: "Click New Lead",
      },
      {
        title: "Drag it along",
        body:
          "Drag a card between columns as the deal moves. The column it sits in is the deal's stage — there is no separate status to keep in step.",
        target: "css:[data-stage]",
      },
      {
        title: "Build the estimate",
        body:
          "Open a lead to size the work by role and grade. Rates come from the same band table delivery uses, so the estimate and the eventual project speak the same language.",
      },
      {
        title: "Convert when it is won",
        body: "Converting carries the estimate across, so the plan starts from what you sold.",
      },
    ],
  },

  // ─── Reporting ──────────────────────────────────────────────
  {
    id: "allocation-report",
    title: "See who is free, and export it",
    summary: "The bench, the over-allocated, and a spreadsheet for the staffing meeting.",
    minutes: 2,
    roles: ["admin", "pm"],
    path: "/admin/allocations",
    group: "Reporting",
    steps: [
      {
        title: "Resource Allocation",
        body: "Everyone in the employee master, across every project at once.",
        target: "nav:/admin/allocations",
        path: "/admin/allocations",
      },
      {
        title: "Read the five figures first",
        body:
          "On bench is idle capacity. Over-allocated is a promise that cannot be kept. Those two are the ones worth acting on.",
        target: "alloc:tiles",
      },
      {
        title: "Narrow it down",
        body:
          "Filter by department or location, or set an as-at date to ask who is free in a particular month. Tick “only the bench and the over-allocated” for the Monday view.",
        target: "alloc:filters",
      },
      {
        title: "Rows are tinted for a reason",
        body:
          "Amber is on the bench, red is over 100%. The tint covers the whole row, because on a wide sheet the last column can be off-screen.",
        target: "css:tbody tr",
      },
      {
        title: "Export what you are looking at",
        body:
          "The download takes the same filters as the screen, so the spreadsheet matches what you just read. Excel for the meeting, CSV if something else has to swallow it.",
        target: "alloc:xlsx",
      },
    ],
  },

  // ─── Service desk ───────────────────────────────────────────
  {
    id: "service-desk",
    title: "Work the service desk",
    summary: "Raise a ticket, find yours, and keep the queue honest.",
    minutes: 2,
    roles: ["admin", "pm", "member"],
    path: "/itsm",
    group: "Service desk",
    steps: [
      {
        title: "The queue",
        body: "Every incident, request and problem, with the project and phase it belongs to.",
        target: "nav:/itsm",
        path: "/itsm",
      },
      {
        title: "Raise one quickly",
        body: "Quick Ticket asks for the minimum. Full Ticket Form is there when it needs detail.",
        target: "ticket:quick",
        action: "Click Quick Ticket",
      },
      {
        title: "Filter by delivery phase",
        body:
          "The phase filter follows the project's real phase, so a ticket raised during UAT stays attached to UAT.",
      },
      {
        title: "Your own queue",
        body: "Consultant View is the same tickets, narrowed to the ones assigned to you.",
        target: "nav:/itsm/consultant-view",
      },
    ],
  },

  // ─── My work ────────────────────────────────────────────────
  {
    id: "timesheet",
    title: "Fill in your timesheet",
    summary: "One week, the projects you are on, and what happens when you submit.",
    minutes: 2,
    roles: ["admin", "pm", "member"],
    path: "/my-timesheet",
    group: "My work",
    steps: [
      {
        title: "My Timesheet",
        body: "One week at a time.",
        target: "nav:/my-timesheet",
        path: "/my-timesheet",
      },
      {
        title: "Only what you are staffed on",
        body:
          "Rows are the projects you are allocated to and the work packages allotted to you. You cannot book time against anything else — a timesheet that lets you book anywhere is a reconciliation problem waiting to happen.",
      },
      {
        title: "Type and click away",
        body:
          "Hours save when you leave the box. Blank or zero clears the entry rather than leaving a nought for somebody to reconcile later.",
      },
      {
        title: "Submit the week",
        body:
          "This puts every draft entry in for approval at once. Once an entry is approved it locks — it is a financial record somebody has signed off.",
        target: "timesheet:submit",
      },
    ],
  },
  {
    id: "my-tasks",
    title: "Keep your tasks up to date",
    summary: "What is allotted to you, and moving a percentage without moving dates.",
    minutes: 1,
    roles: ["admin", "pm", "member"],
    path: "/my-tasks",
    group: "My work",
    steps: [
      {
        title: "My Tasks",
        body: "Everything allotted to you across every project, overdue first.",
        target: "nav:/my-tasks",
        path: "/my-tasks",
      },
      {
        title: "Update your own progress",
        body:
          "You can move the percentage and the status on anything assigned to you. Dates stay with whoever runs the project — that keeps the plan somebody else is reporting on from moving underneath them.",
      },
      {
        title: "It rolls up",
        body:
          "Progress on a work package is weighted by the hours planned against each person, so a package is not 50% done because one of four people finished.",
      },
    ],
  },
  {
    id: "my-skills",
    title: "Put your skills on record",
    summary: "How you get found when somebody is staffing work you can do.",
    minutes: 1,
    roles: ["admin", "pm", "member"],
    path: "/my-skills",
    group: "My work",
    steps: [
      {
        title: "My Skills",
        body:
          "The catalogue covers what the practice staffs — SAP modules, the development stacks, data, cloud, QA and the rest.",
        target: "nav:/my-skills",
        path: "/my-skills",
      },
      {
        title: "You maintain your own",
        body:
          "An admin can edit anyone's, but yours is best kept by you. One person typing a hundred people's skills is how the list goes stale.",
      },
      {
        title: "Proficiency and years are separate",
        body:
          "Somebody can have eight years of something and still be a three. Mark the one or two things you would want to be asked for as primary.",
      },
    ],
  },

  // ─── Administration ─────────────────────────────────────────
  {
    id: "people-and-roles",
    title: "Add someone and give them the right access",
    summary: "Accounts, roles, and what each role can actually reach.",
    minutes: 2,
    roles: ["admin"],
    path: "/admin/roles",
    group: "Administration",
    steps: [
      {
        title: "People & Roles",
        body: "Every account, and what each one can do.",
        target: "nav:/admin/roles",
        path: "/admin/roles",
      },
      {
        title: "Four roles",
        body:
          "Admin runs the company data. PM runs delivery. Member does the work and logs time. Client sees only their own portal.",
      },
      {
        title: "Permission is two locks, not one",
        body:
          "A person's global role sets the ceiling; their role on a particular project narrows it. Being a PM somewhere does not make you a PM everywhere.",
      },
      {
        title: "Signing in needs no password",
        body:
          "A six-digit code goes to the person's work email. In development it is shown on the sign-in screen instead.",
      },
    ],
  },
  {
    id: "master-data",
    title: "Keep the master data straight",
    summary: "Employees, rate bands, skills, and the Darwinbox sync.",
    minutes: 2,
    roles: ["admin"],
    path: "/admin/masters",
    group: "Administration",
    steps: [
      {
        title: "Master Data",
        body: "Employees, rate bands and the lists everything else picks from.",
        target: "nav:/admin/masters",
        path: "/admin/masters",
      },
      {
        title: "Rate bands hang off grades",
        body:
          "Each band maps to a Darwinbox grade, which is how staffing can fill a rate in for you instead of asking. Change a band here and new assignments pick it up.",
      },
      {
        title: "Salary is never fetched",
        body:
          "The Darwinbox sync pulls grade, department, location and designation. CTC and salary are refused at the boundary — they are not fetched and not stored.",
      },
      {
        title: "Skills and who has them",
        body: "The catalogue, and the mapping from people to skills.",
        target: "nav:/admin/skills",
      },
    ],
  },

  // ─── Client ─────────────────────────────────────────────────
  {
    id: "client-portal",
    title: "Find your way around your portal",
    summary: "Where your project has got to, what is coming, and how to ask for help.",
    minutes: 1,
    roles: ["client"],
    path: "/portal",
    group: "Getting started",
    steps: [
      {
        title: "Welcome",
        body:
          "This is your view of the work we are doing for you. It takes a minute, and Escape closes it at any point.",
      },
      {
        title: "Your projects",
        body: "Each one with where it has got to and when it is due.",
        target: "nav:/portal",
        path: "/portal",
      },
      {
        title: "Open one for the detail",
        body:
          "The stages, what is complete, the milestones coming up, and any documents shared with you.",
        target: "css:[data-guide='portal:project'], main a",
      },
      {
        title: "Raising a ticket",
        body:
          "Anything you need looked at goes here, and you can follow it in the same place.",
        target: "portal:raise-ticket",
      },
      {
        title: "Your tickets",
        body: "Everything you have raised, and where each one has got to.",
        target: "nav:/itsm",
      },
    ],
  },

  // ─── Agile & Quality ────────────────────────────────────────────
  {
    id: "agile-quality",
    title: "Sprint Planning & Quality Tracking",
    summary: "Plan your sprints, manage requirements, and link them to test cases.",
    minutes: 4,
    roles: ["admin", "pm"],
    path: "/pmt",
    group: "Delivery",
    steps: [
      {
        title: "Open a project",
        body: "Select a project to plan sprints and track quality.",
        target: "css:tbody tr",
        path: "/pmt",
      },
      {
        title: "Sprint Planning",
        body: "Drag and drop unassigned WBS items from the backlog directly into an active sprint.",
        target: "tab:sprints",
      },
      {
        title: "Requirements",
        body: "Manage project requirements here, categorizing them in folders and tracking their approval state.",
        target: "tab:requirements",
      },
      {
        title: "Test Cases",
        body: "Link your test cases directly to the requirements and WBS tasks to ensure complete coverage.",
        target: "tab:tests",
      },
      {
        title: "Traceability Matrix",
        body: "The matrix cross-references everything for you. Filter by 'Uncovered' to instantly see which requirements are missing test coverage.",
        target: "tab:traceability",
      },
      {
        title: "ITSM Kanban Board",
        body: "Switching to Service Desk tickets, you can now manage them using a drag-and-drop Kanban board.",
        target: "nav:/itsm",
      }
    ],
  },
];

/** True when a guide starts on, or walks through, a Phase 2 page. */
function visitsPhase2(g: Guide): boolean {
  return (
    matchesPrefix(g.path, PHASE2_PAGES) ||
    g.steps.some((s) => (s.path && matchesPrefix(s.path, PHASE2_PAGES)) ||
      (s.target?.startsWith("nav:") && matchesPrefix(s.target.slice(4), PHASE2_PAGES)))
  );
}

/** The guides this role may run. During the Phase 1 rollout a regular
 *  member is not offered tours of screens they cannot open yet. */
export function guidesForRole(role: AppRole): Guide[] {
  const phase1 = isPhase1Restricted(role);
  return GUIDES.filter((g) => g.roles.includes(role) && !(phase1 && visitsPhase2(g)));
}

/**
 * Guides that start on, or visit, the page somebody is looking at —
 * so the panel can put "for this page" at the top rather than making
 * them read the whole list.
 */
export function guidesForPath(role: AppRole, pathname: string): Guide[] {
  const matches = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  return guidesForRole(role).filter(
    (g) => matches(g.path) || g.steps.some((s) => s.path && matches(s.path))
  );
}

export function guideById(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id);
}
