"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { todayISO } from "@/lib/dates";
import { formatCurrency } from "@/lib/utils";
import { workingDaysBetween, round2 } from "@/lib/staffing-calc";

// ═══════════════════════════════════════════════════════════════
// Who is on this project, what they cost, and whether they are
// already spoken for somewhere else.
//
// Cost is absent rather than blank for anybody without the capability
// — the API omits it, so there is nothing here to leak.
// ═══════════════════════════════════════════════════════════════

const PROFICIENCY: Record<number, string> = {
  1: "Aware",
  2: "Working",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

interface Skill {
  id: string;
  name: string;
  category: string | null;
  proficiency: number;
  yearsExperience: number | null;
  isPrimary: boolean;
}

interface Commitment {
  projectCode: string;
  projectName: string;
  allocationPercent: number;
  startDate: string | null;
  endDate: string | null;
}

interface AllocationPeriodItem {
  id?: string;
  startDate: string;
  endDate: string;
  allocationPercent: number;
}

interface Member {
  id: string;
  employeeId: string | null;
  userName: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  roleInProject: string | null;
  allocationPercent: number;
  startDate: string | null;
  endDate: string | null;
  allocationPeriods?: AllocationPeriodItem[] | null;
  isActive: boolean;
  rateBandName: string | null;
  rateBandId: string | null;
  memberType?: "employee" | "intern" | "consultant";
  customDailyCostInr?: number | null;
  skills: Skill[];
  otherProjects: Commitment[];
  committedElsewhere: number;
  totalAllocation: number;
  overAllocated: boolean;
  cost?: {
    dailyCostInr: number | null;
    plannedDays: number | null;
    plannedCostInr: number | null;
    plannedBillableInr: number | null;
    actualHours: number;
    actualDays: number;
    actualCostInr: number | null;
    burnPercent: number | null;
  };
}

interface RateBand {
  id: string;
  bandName: string;
  levelCode: string;
  dailyCostInr: number | null;
  dailyBillableRateInr: number | null;
}

interface SuggestedBand {
  grade: string;
  rateBandId: string | null;
  bandName: string;
  dailyCostInr: number;
  dailyBillableRateInr: number | null;
  source: "level_code" | "band_name" | "grade_default";
}

interface Candidate {
  employeeId: string;
  userId?: string | null;
  isExternal?: boolean;
  fullName: string;
  email: string | null;
  designation: string | null;
  department: string | null;
  jobLevel: string | null;
  location: string | null;
  skills: Skill[];
  onThisProject: boolean;
  standDown?: boolean;
  otherProjects: Commitment[];
  committedElsewhere: number;
  availablePercent: number;
  suggestedBand: SuggestedBand | null;
  bandNote: string;
}

interface CatalogueSkill {
  id: string;
  name: string;
  category: string | null;
  peopleCount: number;
}

// ─── Team roles: Developer, Team Lead, PM — any number of each ─────

interface RoleOption {
  value: string;
  description: string;
}

const DEFAULT_ROLES: RoleOption[] = [
  { value: "Developer", description: "Updates their own work and logs time." },
  { value: "Team Lead", description: "Edits the plan and work breakdown. No finances." },
  { value: "PM", description: "Runs the project — plan, team and finances." },
  { value: "Delivery Manager", description: "Oversees delivery, escalations, and timeline adherence." },
];

const ROLE_STYLE: Record<string, string> = {
  "Delivery Manager": "bg-purple-900 text-white",
  PM: "bg-navy-900 text-white",
  "Team Lead": "bg-blue-50 text-blue-700 border border-blue-200",
  Developer: "bg-neutral-100 text-navy-700 border border-neutral-200",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-sm text-navy-500">—</span>;
  return (
    <span
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        ROLE_STYLE[role] ?? "bg-amber-50 text-amber-700 border border-amber-200"
      }`}
      title={ROLE_STYLE[role] ? undefined : "Not one of the three team roles — edit to set Developer, Team Lead or PM."}
    >
      {role}
    </span>
  );
}

/** PM can only be handed out (or taken away) by an admin or an existing PM of the project. */
function RoleSelect({
  value,
  onChange,
  roles,
  canAssignPm,
  currentlyPm = false,
}: {
  value: string;
  onChange: (value: string) => void;
  roles: RoleOption[];
  canAssignPm: boolean;
  currentlyPm?: boolean;
}) {
  const locked = currentlyPm && !canAssignPm;
  return (
    <select
      value={value}
      disabled={locked}
      onChange={(e) => onChange(e.target.value)}
      title={
        locked
          ? "Only an administrator or one of this project's PMs can change a PM's role."
          : roles.find((r) => r.value === value)?.description
      }
      className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-neutral-50 disabled:text-navy-500"
    >
      {!roles.some((r) => r.value === value) && <option value={value}>{value || "— choose —"}</option>}
      {roles.map((r) => (
        <option key={r.value} value={r.value} disabled={r.value === "PM" && !canAssignPm}>
          {r.value}
          {r.value === "PM" && !canAssignPm ? " (admin or a PM of this project only)" : ""}
        </option>
      ))}
    </select>
  );
}

const rupees = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function TeamTab({
  projectId,
  projectStartDate,
  projectEndDate,
  currency = "INR",
}: {
  projectId: string;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  currency?: string;
}) {
  const [team, setTeam] = useState<Member[]>([]);
  const [totals, setTotals] = useState<Record<string, number | null> | null>(null);
  const [rateBands, setRateBands] = useState<RateBand[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canViewCost, setCanViewCost] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>(DEFAULT_ROLES);
  const [canAssignPm, setCanAssignPm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [activeCurrency, setActiveCurrency] = useState(currency || "INR");
  const [projStart, setProjStart] = useState(projectStartDate || "");
  const [projEnd, setProjEnd] = useState(projectEndDate || "");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/team`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load the team.");
        return;
      }
      setTeam(data.team ?? []);
      setTotals(data.totals ?? null);
      setRateBands(data.rateBands ?? []);
      setCanManage(Boolean(data.canManage));
      setCanViewCost(Boolean(data.canViewCost));
      if (Array.isArray(data.roles) && data.roles.length > 0) setRoles(data.roles);
      setCanAssignPm(Boolean(data.canAssignPm));
      if (data.currency) setActiveCurrency(data.currency);
      if (data.projectStartDate) setProjStart(data.projectStartDate);
      if (data.projectEndDate) setProjEnd(data.projectEndDate);
      setError("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const overAllocatedCount = team.filter((m) => m.overAllocated).length;

  if (loading) {
    return <Card><div className="p-8 text-center text-sm text-navy-500">Loading the team…</div></Card>;
  }

  return (
    <div className="space-y-4">
      {/* ── Summary ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-6 flex-wrap">
          <Stat label="People" value={String(team.length)} />
          {(["PM", "Team Lead", "Developer"] as const).map((r) => {
            const n = team.filter((m) => m.isActive && m.roleInProject === r).length;
            return <Stat key={r} label={r === "PM" ? "PMs" : `${r}s`} value={String(n)} />;
          })}
          {canViewCost && totals && (
            <>
              <Stat label="Planned days" value={String(totals.plannedDays ?? 0)} />
              <Stat label="Planned cost" value={formatCurrency(totals.plannedCostInr, activeCurrency)} />
              <Stat label="Logged so far" value={`${totals.actualDays ?? 0} d`} />
              <Stat
                label="Actual cost"
                value={formatCurrency(totals.actualCostInr, activeCurrency)}
                hint={totals.burnPercent !== null ? `${totals.burnPercent}% of plan` : undefined}
                warn={(totals.burnPercent ?? 0) > 100}
              />
            </>
          )}
        </div>
        {canManage && (
          <Button
            variant={adding ? "secondary" : "primary"}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "Hide Add Person Form" : "+ Add a person"}
          </Button>
        )}
      </div>

      {overAllocatedCount > 0 && (
        <div className="rounded-lg px-4 py-2.5 text-xs border bg-amber-500/5 border-amber-500/30 text-amber-800">
          <span className="font-medium">
            {overAllocatedCount} {overAllocatedCount === 1 ? "person is" : "people are"} committed
            past 100%
          </span>{" "}
          once their other live projects are counted. The rows below show where.
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {adding && (
        <AddPersonPanel
          projectId={projectId}
          rateBands={rateBands}
          canViewCost={canViewCost}
          roles={roles}
          canAssignPm={canAssignPm}
          currency={activeCurrency}
          defaultStartDate={projStart}
          defaultEndDate={projEnd}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}

      {/* ── The team ──────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        {team.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-navy-700 font-medium">Nobody is staffed on this project yet.</p>
            <p className="text-xs text-navy-500 mt-1.5 max-w-md mx-auto">
              Adding people here is what gives the project a planned cost, and what lets them log
              time against it.
            </p>
            {canManage && (
              <Button className="mt-4" onClick={() => setAdding(true)}>
                Add the first person
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {/* Crisp Column Headers to keep rows perfectly aligned */}
            <div className="hidden lg:grid grid-cols-[minmax(240px,1.5fr)_minmax(160px,1fr)_minmax(180px,1.1fr)_minmax(200px,1.2fr)_130px] items-center gap-4 px-5 py-3 bg-neutral-50/80 border-b border-neutral-200/80 text-[11px] font-bold text-navy-600 uppercase tracking-wider">
              <div>Resource / Member</div>
              <div>Role &amp; Timeline</div>
              <div>Allocation %</div>
              <div>Planned vs Actual</div>
              <div className="text-right">Actions</div>
            </div>
            {team.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                projectId={projectId}
                rateBands={rateBands}
                canManage={canManage}
                canViewCost={canViewCost}
                roles={roles}
                canAssignPm={canAssignPm}
                currency={activeCurrency}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">{label}</p>
      <p className={`text-lg font-bold ${warn ? "text-red-600" : "text-navy-900"}`}>{value}</p>
      {hint && <p className={`text-[10px] ${warn ? "text-red-600" : "text-navy-500"}`}>{hint}</p>}
    </div>
  );
}

function SkillChips({ skills, limit = 4 }: { skills: Skill[]; limit?: number }) {
  if (skills.length === 0) {
    return <span className="text-[11px] text-navy-500/60 italic">no skills recorded</span>;
  }
  const shown = skills.slice(0, limit);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((skill) => (
        <span
          key={skill.id}
          title={`${PROFICIENCY[skill.proficiency] ?? ""}${skill.yearsExperience ? ` · ${skill.yearsExperience} yrs` : ""}`}
          className={`text-[10px] px-1.5 py-0.5 rounded border ${
            skill.isPrimary
              ? "bg-navy-900/[0.06] border-navy-500/30 text-navy-900 font-medium"
              : "bg-neutral-50 border-neutral-200 text-navy-700"
          }`}
        >
          {skill.name}
          <span className="text-navy-500/70"> {skill.proficiency}</span>
        </span>
      ))}
      {skills.length > limit && (
        <span className="text-[10px] text-navy-500 px-1 py-0.5">+{skills.length - limit}</span>
      )}
    </span>
  );
}

function AllocationBar({ member }: { member: Member }) {
  const here = Math.min(100, member.allocationPercent);
  const elsewhere = Math.min(100 - here, member.committedElsewhere);
  const over = member.totalAllocation > 100;

  return (
    <div className="w-32">
      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden flex">
        <div className={over ? "bg-red-600" : "bg-navy-700"} style={{ width: `${here}%` }} />
        <div className="bg-navy-500/30" style={{ width: `${elsewhere}%` }} />
      </div>
      <p className={`text-[10px] mt-1 ${over ? "text-red-600 font-medium" : "text-navy-500"}`}>
        {member.allocationPercent}% here
        {member.committedElsewhere > 0 && ` · ${member.committedElsewhere}% elsewhere`}
        {over && ` · ${member.totalAllocation}% total`}
      </p>
    </div>
  );
}

function MemberRow({
  member,
  projectId,
  rateBands,
  canManage,
  canViewCost,
  roles,
  canAssignPm,
  currency = "INR",
  onChanged,
}: {
  member: Member;
  projectId: string;
  rateBands: RateBand[];
  canManage: boolean;
  canViewCost: boolean;
  roles: RoleOption[];
  canAssignPm: boolean;
  currency?: string;
  onChanged: () => void;
}) {
  // A PM row can only be edited or removed by an admin or another PM.
  const isPm = member.roleInProject === "PM";
  const pmLocked = isPm && !canAssignPm;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState("");
  const [showOther, setShowOther] = useState(false);

  const [allocation, setAllocation] = useState(String(member.allocationPercent));
  const [role, setRole] = useState(member.roleInProject ?? "");
  const [startDate, setStartDate] = useState(member.startDate ?? "");
  const [endDate, setEndDate] = useState(member.endDate ?? "");
  const [bandId, setBandId] = useState(member.rateBandId ?? "");
  const [memberType, setMemberType] = useState<"employee" | "intern" | "consultant">(member.memberType ?? "employee");
  const [customCost, setCustomCost] = useState(member.customDailyCostInr ? String(member.customDailyCostInr) : "");
  const [periods, setPeriods] = useState<AllocationPeriodItem[]>(member.allocationPeriods ?? []);
  const [showPeriodsEditor, setShowPeriodsEditor] = useState(Boolean(member.allocationPeriods && member.allocationPeriods.length > 1));

  const save = async (allowOverallocation = false) => {
    setBusy(true);
    setRowError("");
    try {
      const effectivePeriods = showPeriodsEditor && periods.length > 0 ? periods : null;
      const effectiveAllocation = Number(allocation);
      let effectiveStart = startDate || null;
      let effectiveEnd = endDate || null;
      if (effectivePeriods && effectivePeriods.length > 0) {
        const starts = effectivePeriods.map((p) => p.startDate).filter(Boolean).sort();
        const ends = effectivePeriods.map((p) => p.endDate).filter(Boolean).sort();
        if (starts.length > 0) effectiveStart = starts[0];
        if (ends.length > 0) effectiveEnd = ends[ends.length - 1];
      }

      const res = await fetch(`/api/pmt/projects/${projectId}/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocationPercent: effectiveAllocation,
          allocationPeriods: effectivePeriods,
          roleInProject: role,
          startDate: effectiveStart,
          endDate: effectiveEnd,
          rateBandId: bandId || null,
          memberType,
          customDailyCostInr: customCost ? Number(customCost) : null,
          ...(allowOverallocation ? { allowOverallocation: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.resolution === "allowOverallocation") {
          if (window.confirm(`${data.error}\n\nStaff them anyway?`)) {
            setBusy(false);
            return save(true);
          }
          setRowError(data.error);
          return;
        }
        setRowError((data.errors ?? [data.error]).join(" ") || "That change was not saved.");
        return;
      }
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Take ${member.userName} off this project?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/team/${member.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRowError(data.error || "Could not remove them.");
        return;
      }
      if (data.standDown) window.alert(data.message);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const addPeriod = () => {
    const last = periods[periods.length - 1];
    const newStart = last?.endDate || startDate || todayISO();
    setPeriods([
      ...periods,
      { startDate: newStart, endDate: endDate || newStart, allocationPercent: Number(allocation) || 100 },
    ]);
  };

  const removePeriod = (idx: number) => {
    setPeriods(periods.filter((_, i) => i !== idx));
  };

  const updatePeriod = (idx: number, patch: Partial<AllocationPeriodItem>) => {
    setPeriods(periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  return (
    <div className={`px-5 py-4 ${member.isActive ? "" : "bg-neutral-50/60"}`}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1.5fr)_minmax(160px,1fr)_minmax(180px,1.1fr)_minmax(200px,1.2fr)_130px] items-start gap-4">
        {/* Column 1: Person */}
        <div>
          <p className="text-sm font-semibold text-navy-900 flex items-center gap-2 flex-wrap">
            {member.userName ?? member.employeeId}
            {!member.employeeId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                Non-Darwinbox
              </span>
            )}
            {member.memberType === "intern" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                Intern
              </span>
            )}
            {member.memberType === "consultant" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-purple-50 text-purple-700 border border-purple-200" title={member.customDailyCostInr ? `CTC: ${formatCurrency(member.customDailyCostInr, currency)}/day` : undefined}>
                Consultant {member.customDailyCostInr ? `(CTC ${formatCurrency(member.customDailyCostInr, currency)}/d)` : ""}
              </span>
            )}
            {!member.isActive && <Badge>Stood down</Badge>}
            {member.overAllocated && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/10 text-red-600 font-medium">
                over-allocated
              </span>
            )}
          </p>
          <p className="text-[11px] text-navy-500">
            {[member.designation, member.department].filter(Boolean).join(" · ") || member.email}
          </p>
          <div className="mt-1.5">
            <SkillChips skills={member.skills} />
          </div>
        </div>

        {/* Column 2: Role and dates */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold lg:hidden">Role</p>
          <p className="mt-0.5"><RoleBadge role={member.roleInProject} /></p>
          <p className="text-[11px] text-navy-500 mt-1">
            {member.startDate && member.endDate
              ? `${member.startDate} → ${member.endDate}`
              : member.startDate ? `From ${member.startDate}` : "no dates set"}
          </p>
        </div>

        {/* Column 3: Allocation */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold lg:hidden">
            Allocation
          </p>
          <AllocationBar member={member} />
          {member.allocationPeriods && member.allocationPeriods.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="text-[9.5px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200" title={member.allocationPeriods.map(p => `${p.startDate} to ${p.endDate}: ${p.allocationPercent}%`).join("\n")}>
                {member.allocationPeriods.length} multi-periods breakdown
              </span>
            </div>
          )}
          {member.otherProjects.length > 0 && (
            <button
              onClick={() => setShowOther((v) => !v)}
              className="text-[10px] text-navy-700 underline mt-0.5 cursor-pointer block"
            >
              {showOther ? "hide" : `on ${member.otherProjects.length} other project${member.otherProjects.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>

        {/* Column 4: Cost */}
        <div>
          {canViewCost && member.cost ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold lg:hidden">
                Planned vs actual
              </p>
              <p className="text-sm font-semibold text-navy-900">
                {formatCurrency(member.cost.plannedCostInr, currency)}
                <span className="text-navy-500 text-[11px] font-normal">
                  {" "}
                  ({member.cost.plannedDays ?? 0} d
                  {member.rateBandName ? ` · ${member.rateBandName}` : ""})
                </span>
              </p>
              <p
                className={`text-[11px] mt-0.5 ${
                  (member.cost.burnPercent ?? 0) > 100 ? "text-red-600 font-medium" : "text-navy-500"
                }`}
              >
                {formatCurrency(member.cost.actualCostInr, currency)} logged · {member.cost.actualHours} h
                {member.cost.burnPercent !== null && ` · ${member.cost.burnPercent}% of plan`}
              </p>
            </div>
          ) : (
            <span className="text-xs text-navy-400">—</span>
          )}
        </div>

        {/* Column 5: Actions */}
        <div className="flex items-center lg:justify-end gap-2">
          {canManage && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing((v) => !v)} disabled={busy}>
                {editing ? "Cancel" : "Edit"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={remove}
                disabled={busy || pmLocked}
                title={pmLocked ? "Only an administrator or one of this project's PMs can remove a PM." : undefined}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </div>

      {showOther && member.otherProjects.length > 0 && (
        <div className="mt-3 ml-1 border-l-2 border-neutral-200 pl-3 space-y-1">
          {member.otherProjects.map((c) => (
            <p key={c.projectCode} className="text-[11px] text-navy-700">
              <span className="font-mono text-navy-500">{c.projectCode}</span> {c.projectName} —{" "}
              <span className="font-medium">{c.allocationPercent}%</span>
              {c.startDate && c.endDate && (
                <span className="text-navy-500">
                  {" "}
                  ({c.startDate} → {c.endDate})
                </span>
              )}
            </p>
          ))}
        </div>
      )}

      {rowError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {rowError}
        </p>
      )}

      {editing && (
        <div className="mt-4 space-y-3 bg-neutral-50/80 rounded-xl p-4 border border-neutral-200">
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <Field label="Member Type">
              <select
                value={memberType}
                onChange={(e) => setMemberType(e.target.value as any)}
                className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 bg-white"
              >
                <option value="employee">Employee</option>
                <option value="intern">Intern</option>
                <option value="consultant">Consultant</option>
              </select>
            </Field>
            <Field label="Role">
              <RoleSelect
                value={role}
                onChange={setRole}
                roles={roles}
                canAssignPm={canAssignPm}
                currentlyPm={isPm}
              />
            </Field>
            <Field label="Default Allocation %">
              <Input
                type="number"
                min={1}
                max={100}
                value={allocation}
                onChange={(e) => setAllocation(e.target.value)}
              />
            </Field>
            <Field label="From">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            {canViewCost && (
              <>
                <Field label={`Daily Cost Budget (${currency}/d)`}>
                  <Input
                    type="number"
                    placeholder={bandId ? "Override rate e.g. 4000" : "e.g. 4000"}
                    value={customCost}
                    onChange={(e) => setCustomCost(e.target.value)}
                  />
                </Field>
                {member.employeeId && (
                  <Field label="Rate band">
                    <select
                      value={bandId}
                      onChange={(e) => setBandId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white text-navy-900"
                    >
                      <option value="">{customCost ? "Custom Rate (No band)" : "No band"}</option>
                      {rateBands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bandName} ({b.levelCode})
                          {b.dailyCostInr !== null ? ` — ${formatCurrency(b.dailyCostInr, currency)}/day` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}
          </div>

          {/* Multi-period allocation breakdown editor */}
          <div className="pt-2 border-t border-neutral-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`multi-period-${member.id}`}
                  checked={showPeriodsEditor}
                  onChange={(e) => {
                    setShowPeriodsEditor(e.target.checked);
                    if (e.target.checked && periods.length === 0) {
                      setPeriods([{ startDate: startDate || todayISO(), endDate: endDate || todayISO(), allocationPercent: Number(allocation) || 100 }]);
                    }
                  }}
                  className="rounded border-neutral-300 text-navy-900 focus:ring-navy-900"
                />
                <label htmlFor={`multi-period-${member.id}`} className="text-xs font-semibold text-navy-800 cursor-pointer">
                  Allocation % changes over time (Multi-period allocation)
                </label>
              </div>
              {showPeriodsEditor && (
                <Button size="sm" variant="secondary" onClick={addPeriod}>
                  + Add Period
                </Button>
              )}
            </div>

            {showPeriodsEditor && (
              <div className="space-y-2 bg-white p-3 rounded-lg border border-neutral-200">
                <div className="text-xs font-medium text-navy-700 pb-1 mb-1 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2">
                  <span>
                    Multi-period breakdown ({periods.length} {periods.length === 1 ? "period" : "periods"}):
                  </span>
                  <span className="text-[11px] text-navy-500 font-normal">
                    Planned days and costs are calculated and summed across each period
                  </span>
                </div>
                {periods.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                    <div>
                      <span className="text-[10px] text-navy-500 block uppercase font-medium">Period {idx + 1} From</span>
                      <Input
                        type="date"
                        value={p.startDate}
                        onChange={(e) => updatePeriod(idx, { startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-navy-500 block uppercase font-medium">To</span>
                      <Input
                        type="date"
                        value={p.endDate}
                        onChange={(e) => updatePeriod(idx, { endDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-navy-500 block uppercase font-medium">Allocation %</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={String(p.allocationPercent)}
                        onChange={(e) => updatePeriod(idx, { allocationPercent: Number(e.target.value) || 100 })}
                      />
                    </div>
                    <div className="flex items-end pt-3 sm:pt-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => removePeriod(idx)}
                        disabled={periods.length <= 1}
                        className="text-red-600 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => save()} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Adding somebody ───────────────────────────────────────────────

function AddPersonPanel({
  projectId,
  rateBands,
  canViewCost,
  roles,
  canAssignPm,
  currency = "INR",
  defaultStartDate = "",
  defaultEndDate = "",
  onClose,
  onAdded,
}: {
  projectId: string;
  rateBands: RateBand[];
  canViewCost: boolean;
  roles: RoleOption[];
  canAssignPm: boolean;
  currency?: string;
  defaultStartDate?: string | null;
  defaultEndDate?: string | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"search" | "new-external">("search");
  const [extFullName, setExtFullName] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [extMobile, setExtMobile] = useState("");

  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState<CatalogueSkill[]>([]);
  const [chosenSkills, setChosenSkills] = useState<string[]>([]);
  const [minProficiency, setMinProficiency] = useState(3);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);

  const [role, setRole] = useState("Developer");
  const [allocation, setAllocation] = useState("100");
  const [startDate, setStartDate] = useState(defaultStartDate || todayISO());
  const [endDate, setEndDate] = useState(defaultEndDate || "");
  const [bandId, setBandId] = useState("");
  const [memberType, setMemberType] = useState<"employee" | "intern" | "consultant">("employee");
  const [customDailyCostInr, setCustomDailyCostInr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/skills")
      .then((r) => r.json())
      .then((d) => setCatalogue(d.skills ?? []))
      .catch(() => setCatalogue([]));
  }, []);

  // Search follows the dates too, so "already busy" means busy *then*.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (chosenSkills.length > 0) {
          params.set("skills", chosenSkills.join(","));
          params.set("minProficiency", String(minProficiency));
        }
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);

        const res = await fetch(`/api/pmt/projects/${projectId}/team/available?${params}`);
        const data = await res.json().catch(() => ({}));
        setCandidates(data.people ?? []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, chosenSkills, minProficiency, startDate, endDate, projectId]);

  const band = useMemo(() => rateBands.find((b) => b.id === bandId), [rateBands, bandId]);

  const [bandTouched, setBandTouched] = useState(false);
  const effectiveDailyCost = useMemo(() => {
    if (customDailyCostInr) return Number(customDailyCostInr);
    if (band) return band.dailyCostInr;
    if (picked?.suggestedBand) return picked.suggestedBand.dailyCostInr;
    return null;
  }, [band, picked, customDailyCostInr]);

  useEffect(() => {
    if (!picked || bandTouched) return;
    if (picked.isExternal) {
      setMemberType("consultant");
      setBandId("");
    } else if (picked.suggestedBand) {
      setBandId(picked.suggestedBand.rateBandId ?? "");
    }
  }, [picked, bandTouched]);

  const workingDays = useMemo(() => {
    return workingDaysBetween(startDate, endDate);
  }, [startDate, endDate]);

  const plannedCostEstimate = useMemo(() => {
    if (effectiveDailyCost === null || !workingDays) return null;
    const days = (workingDays * (Number(allocation) || 100)) / 100;
    return round2(days * effectiveDailyCost);
  }, [workingDays, effectiveDailyCost, allocation]);

  const submit = async (allowOverallocation = false) => {
    if (activeTab === "search" && !picked) return;
    if (activeTab === "new-external" && (!extFullName.trim() || !extEmail.trim())) {
      setError("Full name and email are required for external resource.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        roleInProject: role,
        allocationPercent: Number(allocation),
        startDate: startDate || null,
        endDate: endDate || null,
        memberType,
        customDailyCostInr: customDailyCostInr ? Number(customDailyCostInr) : null,
        rateBandId: memberType === "consultant" || picked?.isExternal || activeTab === "new-external" ? null : (bandId || null),
        ...(allowOverallocation ? { allowOverallocation: true } : {}),
      };

      if (activeTab === "new-external") {
        payload.isNewExternal = true;
        payload.isExternal = true;
        payload.fullName = extFullName.trim();
        payload.email = extEmail.trim().toLowerCase();
        payload.mobilePhone = extMobile.trim() || null;
      } else if (picked) {
        payload.employeeId = picked.employeeId;
        payload.userId = picked.userId || null;
        payload.isExternal = Boolean(picked.isExternal);
      }

      const res = await fetch(`/api/pmt/projects/${projectId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.resolution === "allowOverallocation") {
          if (window.confirm(`${data.error}\n\nStaff them anyway?`)) {
            setBusy(false);
            return submit(true);
          }
          setError(data.error);
          return;
        }
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Could not add them.");
        return;
      }
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogueSkill[]>();
    for (const skill of catalogue) {
      const key = skill.category ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(skill);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalogue]);

  return (
    <div className="w-full rounded-2xl border-2 border-navy-900/15 bg-white shadow-sm overflow-hidden mb-6 animate-fade-in">
      <div className="px-6 py-4 bg-navy-50/70 border-b border-navy-900/10 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-navy-900 font-[family-name:var(--font-league-spartan)] flex items-center gap-2">
            <span>Add a person to this project</span>
          </h3>
          <p className="text-xs text-navy-500">
            Staff Darwinbox employees or allocate non-Darwinbox external consultants and resources.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel / Close Form
        </Button>
      </div>

      {/* Mode Tabs */}
      <div className="flex border-b border-neutral-200 bg-neutral-50/50">
        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`px-6 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === "search"
              ? "border-navy-900 text-navy-900 bg-white"
              : "border-transparent text-navy-500 hover:text-navy-800"
          }`}
        >
          🔍 Search Directory (Darwinbox & Non-Darwinbox)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("new-external");
            setPicked(null);
            setMemberType("consultant");
          }}
          className={`px-6 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === "new-external"
              ? "border-navy-900 text-navy-900 bg-white"
              : "border-transparent text-navy-500 hover:text-navy-800"
          }`}
        >
          ✨ + Quick Add Non-Darwinbox / External Resource
        </button>
      </div>

      <div className="p-6 space-y-4">
        {activeTab === "new-external" ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Non-Darwinbox Resource Registration & Allocation
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Allocate external consultants, contractors, or interns who are managed outside Darwinbox and adjust their budget.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Full Name *">
                <Input
                  type="text"
                  placeholder="e.g. Alex Henderson"
                  value={extFullName}
                  onChange={(e) => setExtFullName(e.target.value)}
                />
              </Field>
              <Field label="Email Address *">
                <Input
                  type="email"
                  placeholder="e.g. alex.external@partner.com"
                  value={extEmail}
                  onChange={(e) => setExtEmail(e.target.value)}
                />
              </Field>
              <Field label="Phone Number (Optional)">
                <Input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={extMobile}
                  onChange={(e) => setExtMobile(e.target.value)}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {/* Member type / classification and Budget */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-neutral-50/80 rounded-xl border border-neutral-200">
          <Field label="Resource Type">
            <select
              value={memberType}
              onChange={(e) => setMemberType(e.target.value as any)}
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="employee">Employee</option>
              <option value="intern">Intern</option>
              <option value="consultant">Consultant / External</option>
            </select>
          </Field>

          {canViewCost && (
            <Field label={`Daily Cost Budget (${currency} / Day)`}>
              <Input
                type="number"
                placeholder={bandId ? "Override rate e.g. 4500" : "e.g. 4500"}
                value={customDailyCostInr}
                onChange={(e) => setCustomDailyCostInr(e.target.value)}
              />
            </Field>
          )}

          <div className="flex items-end">
            <p className="text-[11px] text-navy-600 pb-1">
              {customDailyCostInr
                ? `Custom daily CTC budget set to ${formatCurrency(Number(customDailyCostInr), currency)}/day.`
                : memberType === "consultant" || activeTab === "new-external"
                ? "Enter their CTC daily cost budget to calculate planned financials."
                : "Standard rate band applies unless a custom daily cost budget is typed."}
            </p>
          </div>
        </div>

        {/* Dates & Role */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="From">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Allocation %">
            <Input
              type="number"
              min={1}
              max={100}
              value={allocation}
              onChange={(e) => setAllocation(e.target.value)}
            />
          </Field>
          <Field label="Role on this project">
            <RoleSelect value={role} onChange={setRole} roles={roles} canAssignPm={canAssignPm} />
          </Field>
        </div>

        {/* Live Budget calculation preview */}
        {canViewCost && effectiveDailyCost !== null && workingDays > 0 && (
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between text-xs flex-wrap gap-2">
            <div>
              <span className="font-semibold text-blue-950">Planned Cost Budget:</span>{" "}
              <strong className="text-blue-900 font-bold text-sm">
                {formatCurrency(plannedCostEstimate ?? 0, currency)}
              </strong>
              <span className="text-blue-700 text-[11px] ml-1.5">
                ({round2((workingDays * (Number(allocation) || 100)) / 100)} working days @ {formatCurrency(effectiveDailyCost, currency)}/day)
              </span>
            </div>
            <span className="text-[11px] text-blue-600">
              Budget will be tracked in project financials & timesheets
            </span>
          </div>
        )}

        {activeTab === "search" && (
          <>
            {/* Skill filter */}
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                  Needs these skills
                </p>
                <label className="text-[11px] text-navy-500 flex items-center gap-1.5">
                  at least
                  <select
                    value={minProficiency}
                    onChange={(e) => setMinProficiency(Number(e.target.value))}
                    className="text-[11px] border border-neutral-200 rounded px-1.5 py-0.5 bg-white"
                  >
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        {level} · {PROFICIENCY[level]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-2 max-h-28 overflow-y-auto border border-neutral-100 rounded-lg p-2 space-y-1.5">
                {grouped.map(([category, skills]) => (
                  <div key={category} className="flex items-start gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-navy-500/70 font-semibold w-20 flex-shrink-0 pt-1">
                      {category}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {skills.map((skill) => {
                        const on = chosenSkills.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            onClick={() =>
                              setChosenSkills((prev) =>
                                on ? prev.filter((s) => s !== skill.id) : [...prev, skill.id]
                              )
                            }
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                              on
                                ? "bg-navy-900 text-white border-navy-900"
                                : "bg-white text-navy-700 border-neutral-200 hover:border-navy-500/40"
                            }`}
                          >
                            {skill.name}
                            <span className={on ? "text-white/60" : "text-navy-500/60"}>
                              {" "}
                              {skill.peopleCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Darwinbox employees or Non-Darwinbox external users by name, email, department…"
            />

            {/* Candidates */}
            <div className="border border-neutral-100 rounded-lg divide-y divide-neutral-100 max-h-72 overflow-y-auto">
              {searching && candidates.length === 0 && (
                <p className="p-6 text-center text-xs text-navy-500">Searching…</p>
              )}
              {!searching && candidates.length === 0 && (
                <p className="p-6 text-center text-xs text-navy-500">
                  Nobody matches. Try fewer skills, or click "+ Quick Add Non-Darwinbox Resource" above.
                </p>
              )}
              {candidates.map((person) => {
                const chosen = picked?.employeeId === person.employeeId;
                const wouldExceed = person.committedElsewhere + Number(allocation || 0) > 100;
                return (
                  <button
                    key={person.employeeId}
                    onClick={() => {
                      setPicked(person);
                      setBandTouched(false);
                      if (person.isExternal) {
                        setMemberType("consultant");
                        setBandId("");
                      }
                    }}
                    disabled={person.onThisProject}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      person.onThisProject
                        ? "opacity-50 cursor-not-allowed"
                        : chosen
                          ? "bg-navy-900/[0.06] cursor-pointer"
                          : "hover:bg-neutral-50 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-[200px]">
                        <p className="text-sm font-medium text-navy-900 flex items-center gap-1.5 flex-wrap">
                          {person.fullName}
                          {person.isExternal ? (
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              Non-Darwinbox
                            </span>
                          ) : (
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              Darwinbox
                            </span>
                          )}
                          {person.onThisProject && (
                            <span className="ml-1 text-[10px] text-navy-500 font-normal">already on this project</span>
                          )}
                        </p>
                        <p className="text-[11px] text-navy-500">
                          {[person.designation, person.department, person.location]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-1">
                          <SkillChips skills={person.skills} limit={5} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xs font-medium ${
                            person.availablePercent === 0
                              ? "text-red-600"
                              : person.availablePercent < 50
                                ? "text-amber-700"
                                : "text-emerald-700"
                          }`}
                        >
                          {person.availablePercent}% free
                        </p>
                        {person.otherProjects.length > 0 && (
                          <p className="text-[10px] text-navy-500">
                            on {person.otherProjects.map((c) => `${c.projectCode} (${c.allocationPercent}%)`).join(", ")}
                          </p>
                        )}
                        {wouldExceed && !person.onThisProject && (
                          <p className="text-[10px] text-red-600 font-medium">
                            {allocation}% here would put them over
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Rate band for internal staff */}
            {canViewCost && (!picked || !picked.isExternal) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Rate band">
                  <select
                    value={bandId}
                    onChange={(e) => {
                      setBandTouched(true);
                      setBandId(e.target.value);
                    }}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30 bg-white"
                  >
                    <option value="">
                      {picked?.suggestedBand
                        ? `${picked.suggestedBand.bandName} — from grade ${picked.suggestedBand.grade}`
                        : customDailyCostInr ? "Custom daily cost budget set" : "Set from the person's grade"}
                    </option>
                    {rateBands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bandName} ({b.levelCode})
                        {b.dailyCostInr !== null ? ` — ${formatCurrency(b.dailyCostInr, currency)}/day` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end">
                  <p className="text-xs text-navy-500">
                    {picked && !bandTouched && picked.suggestedBand && (
                      <span
                        className={
                          picked.suggestedBand.source === "grade_default"
                            ? "block text-amber-700 mb-1"
                            : "block text-emerald-700 mb-1"
                        }
                      >
                        {picked.bandNote}
                      </span>
                    )}
                    {effectiveDailyCost !== null && startDate && endDate ? (
                      <>
                        Planned cost: {formatCurrency(effectiveDailyCost, currency)}/day.
                      </>
                    ) : (
                      "Choose somebody and a date range to see the planned cost."
                    )}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between gap-3 bg-neutral-50/60">
        <p className="text-xs text-navy-500">
          {activeTab === "new-external"
            ? (extFullName ? `Adding external resource ${extFullName}` : "Enter external resource details above.")
            : (picked ? `Adding ${picked.fullName} (${picked.isExternal ? "Non-Darwinbox" : "Darwinbox"})` : "Choose somebody from the list above.")}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => submit()}
            disabled={busy || (activeTab === "search" && !picked) || (activeTab === "new-external" && (!extFullName.trim() || !extEmail.trim()))}
          >
            {busy ? "Adding…" : "Add to project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
