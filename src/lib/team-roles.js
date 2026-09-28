// ═══════════════════════════════════════════════════════════════
// The three roles a person can hold on a project team.
//
//   PM         runs the project: plan, team, finances
//   Team Lead  edits the plan and the work breakdown; no finances
//   Developer  updates their own work and logs time
//
// A project can have any number of each. role_in_project used to be free
// text ("Senior Consultant", "QA Engineer", "Tech Lead"…); it is now
// always one of these three strings. Client contacts are not team
// members and keep their own row (see isClientContactRole).
//
// CommonJS so the migration and the allocation-import CLI can require it
// with plain `node`; team-roles.d.ts types it for the app.
// ═══════════════════════════════════════════════════════════════

const PM = "PM";
const TEAM_LEAD = "Team Lead";
const DEVELOPER = "Developer";

/** In the order they are offered in a dropdown. */
const TEAM_ROLES = [DEVELOPER, TEAM_LEAD, PM];

/** Roles a person may give themselves. PM is granted, never self-declared. */
const SELF_SELECTABLE_ROLES = [DEVELOPER, TEAM_LEAD];

const DESCRIPTIONS = {
  [PM]: "Runs the project — plan, team and finances.",
  [TEAM_LEAD]: "Edits the plan and work breakdown. No finances.",
  [DEVELOPER]: "Updates their own work and logs time.",
};

function clean(raw) {
  return String(raw == null ? "" : raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

/**
 * Strict: one of the three roles, allowing only obvious spellings
 * ("pm", "project manager", "team lead", "tl", "dev"). Anything else is
 * null — the caller should refuse it and list the three.
 */
function toTeamRole(raw) {
  const v = clean(raw);
  if (!v) return null;
  if (v === "pm" || v === "project manager") return PM;
  if (v === "team lead" || v === "teamlead" || v === "tl" || v === "lead") return TEAM_LEAD;
  if (v === "developer" || v === "dev") return DEVELOPER;
  return null;
}

/** A row that belongs to a client contact, not to the delivery team. */
function isClientContactRole(raw) {
  return /(client|customer|sponsor rep|stakeholder)/.test(clean(raw));
}

/**
 * Lenient: maps the old free-text titles onto the three. Used by the
 * one-off migration and by the allocation import, where the sheet may
 * still carry last year's dropdown. Blank becomes Developer.
 */
function legacyToTeamRole(raw) {
  const strict = toTeamRole(raw);
  if (strict) return strict;
  const v = clean(raw);
  if (/(^|\b)(pm|project manager|delivery manager|program manager|programme manager|owner)(\b|$)/.test(v)) return PM;
  if (/(lead|architect|principal|scrum master)/.test(v)) return TEAM_LEAD;
  return DEVELOPER;
}

module.exports = {
  PM,
  TEAM_LEAD,
  DEVELOPER,
  TEAM_ROLES,
  SELF_SELECTABLE_ROLES,
  TEAM_ROLE_DESCRIPTIONS: DESCRIPTIONS,
  toTeamRole,
  legacyToTeamRole,
  isClientContactRole,
};
