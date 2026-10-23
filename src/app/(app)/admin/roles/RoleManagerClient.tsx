"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { ColorBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

interface ManagedUser { 
  roleCodes?: string[]; 
  roleNames?: string[];
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
  sales: "bg-fuchsia-500/10 text-fuchsia-700",
  functional_consultant: "bg-amber-600/10 text-amber-700",
  technical_consultant: "bg-cyan-600/10 text-cyan-700",
  ticket_handler: "bg-emerald-600/10 text-emerald-700",
  viewer: "bg-slate-500/10 text-slate-700",
};

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

const WHAT_THEY_CAN_DO: Record<string, string[]> = {
  admin: ["Full system access across all modules", "Employee master and company masters", "Assign and manage roles for anyone", "Run the Darwinbox sync", "Delete projects and stage-gate records"],
  project_manager: ["Create and run projects", "Build and edit plans, WBS and the Gantt", "Approve timesheets, manage invoices", "See financials and cost", "Record stage-gate reviews"],
  agent: ["Work ITSM tickets", "See projects they are on", "Log their own time"],
  member: ["See projects they are on", "Update progress on their own work", "Log their own time", "Raise risks and tickets", "No commercial visibility"],
  client: ["Read the plan and shared documents", "See invoices raised to them", "Raise tickets", "Change nothing"],
  sales: ["Access leads and solutioning", "Full access to ITSM", "View projects and financials"],
  functional_consultant: ["Manage functional specifications", "Execute and support project deliverables", "Log time and track tasks"],
  technical_consultant: ["Manage technical implementation & configurations", "Execute and support project deliverables", "Log time and track tasks"],
  ticket_handler: ["Manage, assign and resolve ITSM support tickets", "Update ticket statuses and assignments"],
  viewer: ["Read-only view across permitted modules", "Cannot edit projects, financials, or settings"],
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
  const [managingUser, setManagingUser] = useState<{
    user: ManagedUser;
    selectedCodes: string[];
  } | null>(null);
  const [modalError, setModalError] = useState("");
  const [showMatrix, setShowMatrix] = useState(false);

  // Modals for Create
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", fullName: "" });
  const [newRole, setNewRole] = useState({ code: "", name: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set("includeInactive", "1");
      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not load users."); return; }
      setUsers(data.users ?? []);
      setRoles(data.roles ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally { setLoading(false); }
  }, [includeInactive]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && !(u.roleCodes || []).includes(roleFilter)) return false;
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
      const keys = (u.roleCodes && u.roleCodes.length > 0) ? u.roleCodes : ["(none)"];
      for (const key of keys) {
        map[key] = (map[key] ?? 0) + 1;
      }
    });
    return map;
  }, [users]);

  const openManageRoles = (user: ManagedUser) => {
    setModalError("");
    setManagingUser({
      user,
      selectedCodes: [...(user.roleCodes || [])],
    });
  };

  const toggleRoleCode = (code: string) => {
    if (!managingUser) return;
    setManagingUser((prev) => {
      if (!prev) return null;
      const exists = prev.selectedCodes.includes(code);
      const nextCodes = exists
        ? prev.selectedCodes.filter((c) => c !== code)
        : [...prev.selectedCodes, code];
      return { ...prev, selectedCodes: nextCodes };
    });
  };

  const saveRoles = async () => {
    if (!managingUser) return;
    setBusyId(managingUser.user.id);
    setModalError("");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: managingUser.user.id,
          roleCodes: managingUser.selectedCodes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setModalError(data.error || "Could not change roles.");
        return;
      }
      setNotice(data.message || `Roles updated for ${managingUser.user.fullName}.`);
      const newCodes = managingUser.selectedCodes;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === managingUser.user.id
            ? {
                ...u,
                roleCodes: newCodes,
                roleCode: newCodes[0] || null,
                roleName: roles.find((r) => r.code === newCodes[0])?.name ?? newCodes[0] ?? null,
                roleNames: newCodes.map((rc) => roles.find((r) => r.code === rc)?.name ?? rc),
              }
            : u
        )
      );
      setManagingUser(null);
    } catch {
      setModalError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user: ManagedUser) => {
    setBusyId(user.id); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, isActive: !user.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not update the account."); return; }
      setNotice(data.message || "Updated.");
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)));
    } catch { setError("Could not reach the server."); } 
    finally { setBusyId(null); }
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.fullName) return alert("Email and full name required");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user", email: newUser.email, fullName: newUser.fullName }),
      });
      if (res.ok) { setCreatingUser(false); setNewUser({ email: "", fullName: "" }); load(); }
      else alert("Failed to create user");
    } catch { alert("Error"); }
  };

  const createRole = async () => {
    if (!newRole.code || !newRole.name) return alert("Code and name required");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "role", code: newRole.code, name: newRole.name, description: newRole.description }),
      });
      if (res.ok) { setCreatingRole(false); setNewRole({ code: "", name: "", description: "" }); load(); }
      else alert("Failed to create role");
    } catch { alert("Error"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">People &amp; Roles</h1>
          <p className="text-sm text-navy-500 mt-1">A role decides what someone can do everywhere. Their role on a specific project can narrow it further.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowMatrix(true)}>What can each role do?</Button>
          <Button variant="secondary" onClick={() => setCreatingRole(true)}>Add Role</Button>
          <Button onClick={() => setCreatingUser(true)}>Add Person</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setRoleFilter("")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${roleFilter === "" ? "bg-navy-900 text-white border-navy-900" : "bg-white text-navy-600 border-neutral-200 hover:bg-neutral-50"}`}
        >
          All Roles <span className="ml-1.5 text-[10px] bg-black/10 px-1.5 py-0.5 rounded-md">{users.length}</span>
        </button>
        {roles.map((r) => (
          <button
            key={r.code}
            onClick={() => setRoleFilter(r.code)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${roleFilter === r.code ? "bg-navy-900 text-white border-navy-900" : "bg-white text-navy-600 border-neutral-200 hover:bg-neutral-50"}`}
          >
            {r.name} <span className="ml-1.5 text-[10px] bg-black/10 px-1.5 py-0.5 rounded-md">{counts[r.code] || 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[280px] max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-navy-600 cursor-pointer">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="rounded border-navy-300 text-navy-600 focus:ring-navy-600" />
          Show inactive accounts
        </label>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">{error}</div>}
      {notice && <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100">{notice}</div>}

      <Card className="p-0 overflow-hidden border border-neutral-200">
        <div className="divide-y divide-neutral-100">
          {loading && <div className="py-12 text-center text-sm text-navy-500">Loading directory...</div>}
          
          {!loading && visible.map((user) => (
            <div key={user.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-neutral-50/50 transition-colors ${!user.isActive ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-navy-900 truncate">{user.fullName || "(no name)"}</p>
                  {user.id === currentUserId && <ColorBadge colorClass="bg-navy-900/10 text-navy-900">You</ColorBadge>}
                  {!user.isActive && <ColorBadge colorClass="bg-red-600/10 text-red-700">Deactivated</ColorBadge>}
                  {user.designation && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-navy-50 text-navy-600 border border-navy-200/60 truncate max-w-[160px]">{user.designation}</span>}
                  {user.department && <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${DEPT_BADGE_COLOR[user.department] ?? "bg-neutral-100 text-navy-600"}`}>{user.department}</span>}
                </div>
                <p className="text-xs text-navy-500 truncate">{user.email}</p>
                <p className="text-[11px] text-navy-500/70 truncate mt-0.5">
                  {[user.officeLocation, user.jobLevel].filter(Boolean).join(" · ") || "Not in the employee master"}
                  {" · last signed in "} {relative(user.lastLoginAt)}
                </p>
              </div>

              <div className="flex flex-col gap-2 items-end">
                <div className="flex flex-wrap justify-end gap-1">
                   {user.roleNames && user.roleNames.length > 0 ? user.roleNames.map((rn, idx) => (
                       <ColorBadge key={idx} colorClass={ROLE_COLOR[user.roleCodes![idx] ?? ""] ?? "bg-navy-500/10 text-navy-700"}>{rn}</ColorBadge>
                   )) : <ColorBadge colorClass="bg-navy-500/10 text-navy-700">No role</ColorBadge>}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openManageRoles(user)}
                      disabled={busyId === user.id}
                    >
                      Manage Roles
                    </Button>
                  <button onClick={() => toggleActive(user)} disabled={busyId === user.id || user.id === currentUserId} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                    {user.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loading && visible.length === 0 && (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-navy-900">Nobody matches that</p>
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={managingUser !== null}
        onClose={() => {
          if (busyId === null) setManagingUser(null);
        }}
        title="Manage User Roles"
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-navy-500">
              {!managingUser?.selectedCodes.length
                ? "No roles selected (default access)"
                : `${managingUser.selectedCodes.length} role${managingUser.selectedCodes.length === 1 ? "" : "s"} selected`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setManagingUser(null)}
                disabled={busyId !== null}
              >
                Cancel
              </Button>
              <Button
                onClick={saveRoles}
                disabled={busyId !== null}
              >
                {busyId === managingUser?.user.id ? "Saving..." : "Save Roles"}
              </Button>
            </div>
          </div>
        }
      >
        {managingUser && (
          <div className="space-y-4">
            {/* User profile card */}
            <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200/70">
              <Avatar name={managingUser.user.fullName} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-navy-900 truncate">
                    {managingUser.user.fullName}
                  </span>
                  {managingUser.user.id === currentUserId && (
                    <ColorBadge colorClass="bg-navy-900/10 text-navy-900">You</ColorBadge>
                  )}
                  {!managingUser.user.isActive && (
                    <ColorBadge colorClass="bg-red-600/10 text-red-700">Deactivated</ColorBadge>
                  )}
                  {managingUser.user.department && (
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${DEPT_BADGE_COLOR[managingUser.user.department] ?? "bg-neutral-100 text-navy-600"}`}>
                      {managingUser.user.department}
                    </span>
                  )}
                </div>
                <p className="text-xs text-navy-500 truncate">{managingUser.user.email}</p>
                {managingUser.user.designation && (
                  <p className="text-[11px] text-navy-500/80 truncate mt-0.5">{managingUser.user.designation}</p>
                )}
              </div>
            </div>

            {/* Error inside modal */}
            {modalError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{modalError}</span>
              </div>
            )}

            {/* Security Notice: Granting Admin */}
            {managingUser.selectedCodes.includes("admin") && !(managingUser.user.roleCodes || []).includes("admin") && (
              <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200/80 flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <span className="font-semibold">Security Notice: </span>
                  Granting Administrator gives unrestricted access to employee records, system masters, user role assignments, and Darwinbox synchronization.
                </div>
              </div>
            )}

            {/* Warning: Revoking Admin from Self */}
            {managingUser.user.id === currentUserId &&
              (managingUser.user.roleCodes || []).includes("admin") &&
              !managingUser.selectedCodes.includes("admin") && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-lg border border-red-200 flex items-start gap-2">
                <svg className="w-4 h-4 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <span className="font-semibold">Warning: </span>
                  You are removing the Administrator role from yourself. Once saved, you will immediately lose access to this admin section.
                </div>
              </div>
            )}

            <div className="text-xs font-semibold uppercase tracking-wider text-navy-400 pt-1">
              Select System Roles
            </div>

            {/* Role List */}
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {roles.map((r) => {
                const isChecked = managingUser.selectedCodes.includes(r.code);
                const descLines = WHAT_THEY_CAN_DO[r.code] ?? (r.description ? [r.description] : []);
                return (
                  <div
                    key={r.code}
                    onClick={() => toggleRoleCode(r.code)}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isChecked
                        ? "bg-navy-50/60 border-navy-300 ring-1 ring-navy-300/50 shadow-xs"
                        : "bg-white border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // Controlled by outer card onClick
                      className="mt-1 h-4 w-4 rounded border-neutral-300 text-navy-900 focus:ring-navy-600 pointer-events-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-navy-900">{r.name}</span>
                        <ColorBadge colorClass={ROLE_COLOR[r.code] ?? "bg-neutral-100 text-navy-700"}>
                          {r.code}
                        </ColorBadge>
                      </div>
                      <p className="text-xs text-navy-500 mt-1 leading-relaxed">
                        {descLines.join(" · ")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showMatrix} onClose={() => setShowMatrix(false)} title="What each role can do" className="max-w-2xl">
         <div className="space-y-5">
           {roles.map((role) => (
             <div key={role.code}>
               <div className="flex items-center gap-2 mb-1.5"><ColorBadge colorClass={ROLE_COLOR[role.code] ?? "bg-navy-500/10 text-navy-700"}>{role.name}</ColorBadge></div>
               <ul className="text-sm text-navy-700 space-y-1 ml-1">
                 {(WHAT_THEY_CAN_DO[role.code] ?? [role.description ?? ""]).map((line) => (
                   <li key={line} className="flex gap-2"><span className="text-navy-500/50">·</span><span>{line}</span></li>
                 ))}
               </ul>
             </div>
           ))}
         </div>
      </Modal>

      <Modal isOpen={creatingUser} onClose={() => setCreatingUser(false)} title="Add Person" footer={<><Button variant="secondary" onClick={() => setCreatingUser(false)}>Cancel</Button><Button onClick={createUser}>Add Person</Button></>}>
        <div className="space-y-4">
          <div><label className="text-sm font-medium">Full Name</label><Input value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Email</label><Input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} /></div>
        </div>
      </Modal>

      <Modal isOpen={creatingRole} onClose={() => setCreatingRole(false)} title="Add Role" footer={<><Button variant="secondary" onClick={() => setCreatingRole(false)}>Cancel</Button><Button onClick={createRole}>Add Role</Button></>}>
        <div className="space-y-4">
          <div><label className="text-sm font-medium">Role Code (e.g., custom_role)</label><Input value={newRole.code} onChange={e => setNewRole({...newRole, code: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Role Name (e.g., Custom Role)</label><Input value={newRole.name} onChange={e => setNewRole({...newRole, name: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Description</label><Input value={newRole.description} onChange={e => setNewRole({...newRole, description: e.target.value})} /></div>
        </div>
      </Modal>
    </div>
  );
}
