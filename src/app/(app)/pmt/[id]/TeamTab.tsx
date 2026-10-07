"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { todayISO } from "@/lib/dates";

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
  isActive: boolean;
  rateBandName: string | null;
  rateBandId: string | null;
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
  fullName: string;
  email: string | null;
  designation: string | null;
  department: string | null;
  location: string | null;
  skills: Skill[];
  onThisProject: boolean;
  otherProjects: Commitment[];
  committedElsewhere: number;
  availablePercent: number;
  suggestedBand: SuggestedBand;
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

export function TeamTab({ projectId }: { projectId: string }) {
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
              <Stat label="Planned cost" value={rupees(totals.plannedCostInr)} />
              <Stat label="Logged so far" value={`${totals.actualDays ?? 0} d`} />
              <Stat
                label="Actual cost"
                value={rupees(totals.actualCostInr)}
                hint={totals.burnPercent !== null ? `${totals.burnPercent}% of plan` : undefined}
                warn={(totals.burnPercent ?? 0) > 100}
              />
              <Stat label="Billable value" value={rupees(totals.plannedBillableInr)} />
            </>
          )}
        </div>
        {canManage && <Button onClick={() => setAdding(true)}>Add a person</Button>}
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

      {/* ── The team ──────────────────────────────────────────── */}
      <Card>
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
                onChanged={load}
              />
            ))}
          </div>
        )}
      </Card>

      {adding && (
        <AddPersonModal
          projectId={projectId}
          rateBands={rateBands}
          canViewCost={canViewCost}
          roles={roles}
          canAssignPm={canAssignPm}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
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
  onChanged,
}: {
  member: Member;
  projectId: string;
  rateBands: RateBand[];
  canManage: boolean;
  canViewCost: boolean;
  roles: RoleOption[];
  canAssignPm: boolean;
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

  const save = async (allowOverallocation = false) => {
    setBusy(true);
    setRowError("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocationPercent: Number(allocation),
          roleInProject: role,
          startDate: startDate || null,
          endDate: endDate || null,
          rateBandId: bandId || null,
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

  return (
    <div className={`px-5 py-4 ${member.isActive ? "" : "bg-neutral-50/60"}`}>
      <div className="flex items-start gap-4 flex-wrap">
        {/* Person */}
        <div className="min-w-[220px] flex-1">
          <p className="text-sm font-semibold text-navy-900 flex items-center gap-2">
            {member.userName ?? member.employeeId}
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

        {/* Role and dates */}
        <div className="min-w-[150px]">
          <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Role</p>
          <p className="mt-0.5"><RoleBadge role={member.roleInProject} /></p>
          <p className="text-[11px] text-navy-500">
            {member.startDate && member.endDate
              ? `${member.startDate} → ${member.endDate}`
              : "no dates set"}
          </p>
        </div>

        {/* Allocation */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
            Allocation
          </p>
          <AllocationBar member={member} />
          {member.otherProjects.length > 0 && (
            <button
              onClick={() => setShowOther((v) => !v)}
              className="text-[10px] text-navy-700 underline mt-0.5 cursor-pointer"
            >
              {showOther ? "hide" : `on ${member.otherProjects.length} other project${member.otherProjects.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>

        {/* Cost */}
        {canViewCost && member.cost && (
          <div className="min-w-[190px]">
            <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
              Planned vs actual
            </p>
            <p className="text-sm text-navy-900">
              {rupees(member.cost.plannedCostInr)}
              <span className="text-navy-500 text-[11px]">
                {" "}
                ({member.cost.plannedDays ?? 0} d
                {member.rateBandName ? ` · ${member.rateBandName}` : ""})
              </span>
            </p>
            <p
              className={`text-[11px] ${
                (member.cost.burnPercent ?? 0) > 100 ? "text-red-600 font-medium" : "text-navy-500"
              }`}
            >
              {rupees(member.cost.actualCostInr)} logged · {member.cost.actualHours} h
              {member.cost.burnPercent !== null && ` · ${member.cost.burnPercent}% of plan`}
            </p>
          </div>
        )}

        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing((v) => !v)} disabled={busy}>
              {editing ? "Cancel" : "Edit"}
            </Button>
            <Button
              variant="secondary"
              onClick={remove}
              disabled={busy || pmLocked}
              title={pmLocked ? "Only an administrator or one of this project's PMs can remove a PM." : undefined}
            >
              Remove
            </Button>
          </div>
        )}
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
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3 bg-neutral-50/70 rounded-lg p-3">
          <Field label="Role">
            <RoleSelect
              value={role}
              onChange={setRole}
              roles={roles}
              canAssignPm={canAssignPm}
              currentlyPm={isPm}
            />
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
          <Field label="From">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          {canViewCost && (
            <Field label="Rate band">
              <select
                value={bandId}
                onChange={(e) => setBandId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-navy-500/30 bg-white"
              >
                <option value="">No band</option>
                {rateBands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bandName} ({b.levelCode})
                    {b.dailyCostInr !== null ? ` — ${rupees(b.dailyCostInr)}/day` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="sm:col-span-5 flex justify-end">
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

function AddPersonModal({
  projectId,
  rateBands,
  canViewCost,
  roles,
  canAssignPm,
  onClose,
  onAdded,
}: {
  projectId: string;
  rateBands: RateBand[];
  canViewCost: boolean;
  roles: RoleOption[];
  canAssignPm: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState<CatalogueSkill[]>([]);
  const [chosenSkills, setChosenSkills] = useState<string[]>([]);
  const [minProficiency, setMinProficiency] = useState(3);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);

  const [role, setRole] = useState("Developer");
  const [allocation, setAllocation] = useState("100");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [bandId, setBandId] = useState("");
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

  // The band follows whoever is picked. A PM can still override it, but
  // the default is the one their grade says, not an empty dropdown.
  const [bandTouched, setBandTouched] = useState(false);
  const effectiveDailyCost = useMemo(() => {
    if (band) return band.dailyCostInr;
    if (picked) return picked.suggestedBand.dailyCostInr;
    return null;
  }, [band, picked]);
  useEffect(() => {
    if (!picked || bandTouched) return;
    setBandId(picked.suggestedBand.rateBandId ?? "");
  }, [picked, bandTouched]);

  const submit = async (allowOverallocation = false) => {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: picked.employeeId,
          rateBandId: bandId || null,
          roleInProject: role,
          allocationPercent: Number(allocation),
          startDate: startDate || null,
          endDate: endDate || null,
          ...(allowOverallocation ? { allowOverallocation: true } : {}),
        }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              Add a person to this project
            </h3>
            <p className="text-xs text-navy-500">
              Search the employee master, or filter by the skills the work needs.
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Dates first: they decide who counts as free */}
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
            placeholder="Name, email, designation or department…"
          />

          {/* Candidates */}
          <div className="border border-neutral-100 rounded-lg divide-y divide-neutral-100 max-h-72 overflow-y-auto">
            {searching && candidates.length === 0 && (
              <p className="p-6 text-center text-xs text-navy-500">Searching…</p>
            )}
            {!searching && candidates.length === 0 && (
              <p className="p-6 text-center text-xs text-navy-500">
                Nobody matches. Try fewer skills, or a lower proficiency.
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
                      <p className="text-sm font-medium text-navy-900">
                        {person.fullName}
                        {person.onThisProject && (
                          <span className="ml-2 text-[10px] text-navy-500">already on this project</span>
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

          {/* Rate band and the cost that follows */}
          {canViewCost && (
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
                    {picked
                      ? `${picked.suggestedBand.bandName} — from grade ${picked.suggestedBand.grade}`
                      : "Set from the person's grade"}
                  </option>
                  {rateBands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bandName} ({b.levelCode})
                      {b.dailyCostInr !== null ? ` — ${rupees(b.dailyCostInr)}/day` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <p className="text-xs text-navy-500">
                  {picked && !bandTouched && (
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
                      Planned cost is worked out from the working days in that window, the
                      allocation and{" "}
                      <span className="font-medium text-navy-900">
                        {rupees(effectiveDailyCost)}/day
                      </span>
                      .
                    </>
                  ) : (
                    "Choose somebody and a date range to see the planned cost."
                  )}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between gap-3 sticky bottom-0 bg-white">
          <p className="text-xs text-navy-500">
            {picked ? `Adding ${picked.fullName}` : "Choose somebody from the list above."}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => submit()} disabled={!picked || busy}>
              {busy ? "Adding…" : "Add to project"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
