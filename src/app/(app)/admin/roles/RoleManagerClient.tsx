"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { ColorBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  darwinboxRef: string | null;
  lastLoginAt: string | null;
  roleCode: string | null;
  roleName: string | null;
  appRole: "admin" | "pm" | "member" | "client";
  designation: string | null;
  department: string | null;
  officeLocation: string | null;
  jobLevel: string | null;
}

interface RoleOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-red-600/10 text-red-700",
  project_manager: "bg-navy-900/10 text-navy-900",
  agent: "bg-blue-500/10 text-blue-700",
  member: "bg-navy-500/10 text-navy-700",
  client: "bg-violet-500/10 text-violet-700",
};

/** Colour-coded department badges matching the AdminMastersClient taxonomy */
const DEPT_BADGE_COLOR: Record<string, string> = {
  SAP: "bg-blue-100 text-blue-700",
  "Non-SAP": "bg-indigo-100 text-indigo-700",
  Director: "bg-amber-100 text-amber-700",
  Account: "bg-emerald-100 text-emerald-700",
  HR: "bg-rose-100 text-rose-700",
  Operations: "bg-orange-100 text-orange-700",
  "IT Infra": "bg-cyan-100 text-cyan-700",
  Sales: "bg-violet-100 text-violet-700",
  Zoho: "bg-teal-100 text-teal-700",
};

/** What each role means, in the same words the permission matrix uses. */
const WHAT_THEY_CAN_DO: Record<string, string[]> = {
  admin: [
    "Everything below, plus:",
    "Employee master and company masters",
    "Assign roles to anyone",
    "Run the Darwinbox sync",
    "Delete projects and stage-gate records",
  ],
  project_manager: [
    "Create and run projects",
    "Build and edit plans, WBS and the Gantt",
    "Approve timesheets, manage invoices",
    "See financials and cost",
    "Record stage-gate reviews",
  ],
  agent: ["Work ITSM tickets", "See projects they are on", "Log their own time"],
  member: [
    "See projects they are on",
    "Update progress on their own work",
    "Log their own time",
    "Raise risks and tickets",
    "No commercial visibility",
  ],
  client: [
    "Read the plan and shared documents",
    "See invoices raised to them",
    "Raise tickets",
    "Change nothing",
  ],
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function RoleManagerClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ user: ManagedUser; roleCode: string } | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set("includeInactive", "1");
      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load users.");
        return;
      }
      setUsers(data.users ?? []);
      setRoles(data.roles ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.roleCode !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.designation?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach((u) => {
      const key = u.roleCode ?? "(none)";
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [users]);

  const applyRole = async (user: ManagedUser, roleCode: string) => {
    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, roleCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not change the role.");
        return;
      }
      setNotice(data.message || "Role updated.");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, roleCode, roleName: roles.find((r) => r.code === roleCode)?.name ?? roleCode }
            : u
        )
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  const requestRoleChange = (user: ManagedUser, roleCode: string) => {
    if (roleCode === user.roleCode) return;
    // Granting or removing admin, and changing your own role, deserve a pause.
    if (roleCode === "admin" || user.roleCode === "admin" || user.id === currentUserId) {
      setConfirming({ user, roleCode });
      return;
    }
    applyRole(user, roleCode);
  };

  const toggleActive = async (user: ManagedUser) => {
    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, isActive: !user.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update the account.");
        return;
      }
      setNotice(data.message || "Updated.");
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u))
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            People &amp; Roles
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            A role decides what someone can do everywhere. Their role on a specific
            project can narrow it further.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setShowMatrix(true)}>
          What can each role do?
        </Button>
      </div>

      {/* ── Role counts as filters ─────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setRoleFilter("")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            roleFilter === ""
              ? "bg-navy-900 text-white border-navy-900"
              : "bg-white text-navy-700 border-neutral-200 hover:bg-neutral-50"
          }`}
        >
          Everyone ({users.length})
        </button>
        {roles.map((role) => (
          <button
            key={role.code}
            onClick={() => setRoleFilter(roleFilter === role.code ? "" : role.code)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              roleFilter === role.code
                ? "bg-navy-900 text-white border-navy-900"
                : "bg-white text-navy-700 border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            {role.name} ({counts[role.code] ?? 0})
          </button>
        ))}
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <Input
            label="Search"
            placeholder="Name, email, designation or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer pb-2.5">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4 rounded border-navy-500/30"
          />
          <span className="text-sm text-navy-700">Show deactivated</span>
        </label>
      </div>

      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-sm rounded-lg px-4 py-3">
          {notice}
        </div>
      )}

      {/* ── The list ───────────────────────────────────────────── */}
      <Card padding="none">
        <div className="bg-neutral-50/75 px-5 py-3 border-b border-neutral-100 text-xs font-semibold text-navy-500 uppercase tracking-wider">
          {loading ? "Loading…" : `${visible.length} person${visible.length === 1 ? "" : "s"}`}
        </div>

        <div className="divide-y divide-neutral-50">
          {visible.map((user) => (
            <div
              key={user.id}
              className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${
                user.isActive ? "hover:bg-navy-900/[0.02]" : "bg-neutral-50/60"
              }`}
            >
              <Avatar name={user.fullName || user.email} size="sm" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-navy-900 truncate">
                    {user.fullName || "(no name)"}
                  </p>
                  {user.id === currentUserId && (
                    <ColorBadge colorClass="bg-navy-900/10 text-navy-900">You</ColorBadge>
                  )}
                  {!user.isActive && (
                    <ColorBadge colorClass="bg-red-600/10 text-red-700">Deactivated</ColorBadge>
                  )}
                  {user.designation && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-navy-50 text-navy-600 border border-navy-200/60 truncate max-w-[160px]">
                      {user.designation}
                    </span>
                  )}
                  {user.department && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
                      DEPT_BADGE_COLOR[user.department] ?? "bg-neutral-100 text-navy-600"
                    }`}>
                      {user.department}
                    </span>
                  )}
                </div>
                <p className="text-xs text-navy-500 truncate">{user.email}</p>
                <p className="text-[11px] text-navy-500/70 truncate mt-0.5">
                  {[user.officeLocation, user.jobLevel]
                    .filter(Boolean)
                    .join(" · ") || "Not in the employee master"}
                  {" · last signed in "}
                  {relative(user.lastLoginAt)}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <ColorBadge colorClass={ROLE_COLOR[user.roleCode ?? ""] ?? "bg-navy-500/10 text-navy-700"}>
                  {user.roleName ?? "No role"}
                </ColorBadge>

                <select
                  value={user.roleCode ?? ""}
                  disabled={busyId === user.id}
                  onChange={(e) => requestRoleChange(user, e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-navy-500/30 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/30 disabled:opacity-50 cursor-pointer"
                >
                  <option value="" disabled>
                    Set role…
                  </option>
                  {roles.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => toggleActive(user)}
                  disabled={busyId === user.id || user.id === currentUserId}
                  title={
                    user.id === currentUserId
                      ? "You cannot deactivate your own account"
                      : undefined
                  }
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {user.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}

          {!loading && visible.length === 0 && (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-navy-900">Nobody matches that</p>
              <p className="text-xs text-navy-500 mt-1">
                {users.length === 0
                  ? "Run the Darwinbox sync, then seed-comprehensive.js to create accounts."
                  : "Try a different search or role filter."}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Confirmation for the consequential changes ─────────── */}
      <Modal
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming?.roleCode === "admin" ? "Grant administrator access?" : "Change this role?"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant={confirming?.roleCode === "admin" ? "destructive" : "primary"}
              onClick={() => confirming && applyRole(confirming.user, confirming.roleCode)}
              disabled={busyId !== null}
            >
              {busyId ? "Saving…" : "Confirm"}
            </Button>
          </>
        }
      >
        {confirming && (
          <div className="space-y-3">
            <p className="text-sm text-navy-700">
              <span className="font-semibold">{confirming.user.fullName || confirming.user.email}</span>{" "}
              will become{" "}
              <span className="font-semibold">
                {roles.find((r) => r.code === confirming.roleCode)?.name ?? confirming.roleCode}
              </span>
              .
            </p>

            {confirming.roleCode === "admin" && (
              <div className="bg-red-600/5 border border-red-600/20 rounded-lg px-4 py-3">
                <p className="text-sm text-red-700 font-medium">This grants full access.</p>
                <p className="text-xs text-red-700/80 mt-1">
                  Including the employee master, every project&apos;s financials, and the
                  ability to change anyone&apos;s role — including yours.
                </p>
              </div>
            )}

            {confirming.user.id === currentUserId && confirming.roleCode !== "admin" && (
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-amber-700">
                  This is your own account. You will lose administrator access as soon as
                  you confirm.
                </p>
              </div>
            )}

            <p className="text-xs text-navy-500">
              Their existing sessions end immediately — they sign in again with the new role.
            </p>
          </div>
        )}
      </Modal>

      {/* ── The matrix, in plain language ──────────────────────── */}
      <Modal
        isOpen={showMatrix}
        onClose={() => setShowMatrix(false)}
        title="What each role can do"
        className="max-w-2xl"
      >
        <div className="space-y-5">
          {roles.map((role) => (
            <div key={role.code}>
              <div className="flex items-center gap-2 mb-1.5">
                <ColorBadge colorClass={ROLE_COLOR[role.code] ?? "bg-navy-500/10 text-navy-700"}>
                  {role.name}
                </ColorBadge>
              </div>
              <ul className="text-sm text-navy-700 space-y-1 ml-1">
                {(WHAT_THEY_CAN_DO[role.code] ?? [role.description ?? ""]).map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-navy-500/50">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="pt-4 border-t border-neutral-100">
            <p className="text-sm font-medium text-navy-900">Project roles narrow this further</p>
            <p className="text-xs text-navy-500 mt-1">
              Someone&apos;s role on the team of a specific project — manager, lead,
              contributor, viewer or client contact — can only take access away, never add
              it. A project manager who is a viewer on another project reads that one
              without editing it. Administrators are exempt.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
