// Types for team-roles.js (CommonJS so plain `node` scripts can use it).

export type TeamRole = "PM" | "Team Lead" | "Developer";

export const PM: "PM";
export const TEAM_LEAD: "Team Lead";
export const DEVELOPER: "Developer";

/** Developer, Team Lead, PM — dropdown order. */
export const TEAM_ROLES: readonly TeamRole[];
/** What someone may pick for themselves: Developer and Team Lead. */
export const SELF_SELECTABLE_ROLES: readonly TeamRole[];
export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string>;

/** One of the three, or null. */
export function toTeamRole(raw: unknown): TeamRole | null;
/** Old free-text titles mapped onto the three; blank → Developer. */
export function legacyToTeamRole(raw: unknown): TeamRole;
/** True for a client contact's row, which is not a team role. */
export function isClientContactRole(raw: unknown): boolean;
