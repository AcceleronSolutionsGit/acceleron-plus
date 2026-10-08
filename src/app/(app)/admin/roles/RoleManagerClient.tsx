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
  admin: ["Everything below, plus:", "Employee master and company masters", "Assign roles to anyone", "Run the Darwinbox sync", "Delete projects and stage-gate records"],
  project_manager: ["Create and run projects", "Build and edit plans, WBS and the Gantt", "Approve timesheets, manage invoices", "See financials and cost", "Record stage-gate reviews"],
  agent: ["Work ITSM tickets", "See projects they are on", "Log their own time"],
  member: ["See projects they are on", "Update progress on their own work", "Log their own time", "Raise risks and tickets", "No commercial visibility"],
  client: ["Read the plan and shared documents", "See invoices raised to them", "Raise tickets", "Change nothing"],
  sales: ["Access leads and solutioning", "Full access to ITSM", "View projects and financials"],
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
  const [confirming, setConfirming] = useState<{ user: ManagedUser; roleCodes: string[] } | null>(null);
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

  const applyRoles = async (user: ManagedUser, roleCodes: string[]) => {
    setBusyId(user.id); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, roleCodes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not change roles."); return; }
      setNotice(data.message || "Roles updated.");
      setUsers((prev) => prev.map((u) => u.id === user.id ? { 
        ...u, 
        roleCodes, 
        roleCode: roleCodes[0] || null,
        roleName: roles.find((r) => r.code === roleCodes[0])?.name ?? roleCodes[0] ?? null,
        roleNames: roleCodes.map(rc => roles.find((r) => r.code === rc)?.name ?? rc)
      } : u));
    } catch { setError("Could not reach the server."); } 
    finally { setBusyId(null); setConfirming(null); }
  };

  const requestRoleChange = (user: ManagedUser, roleCode: string, add: boolean) => {
    let newRoles = [...(user.roleCodes || [])];
    if (add) {
      if (!newRoles.includes(roleCode)) newRoles.push(roleCode);
    } else {
      newRoles = newRoles.filter(r => r !== roleCode);
    }
    
    if (newRoles.includes("admin") && !(user.roleCodes||[]).includes("admin")) {
      setConfirming({ user, roleCodes: newRoles });
      return;
    }
    if (!(newRoles.includes("admin")) && (user.roleCodes||[]).includes("admin") && user.id === currentUserId) {
      setConfirming({ user, roleCodes: newRoles });
      return;
    }
    applyRoles(user, newRoles);
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
                    <div className="relative group">
                        <Button variant="secondary" size="sm" disabled={busyId === user.id}>Manage Roles</Button>
                        <div className="absolute right-0 mt-2 w-56 bg-white border border-neutral-200 rounded-md shadow-lg z-10 hidden group-hover:block p-2">
                           <div className="text-xs font-semibold text-neutral-500 mb-2">Assign Roles</div>
                           {roles.map(r => (
                               <label key={r.code} className="flex items-center gap-2 text-sm p-1 hover:bg-neutral-50 rounded cursor-pointer">
                                   <input type="checkbox" checked={(user.roleCodes || []).includes(r.code)} onChange={(e) => requestRoleChange(user, r.code, e.target.checked)} />
                                   {r.name}
                               </label>
                           ))}
                        </div>
                    </div>
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

      <Modal isOpen={confirming !== null} onClose={() => setConfirming(null)} title="Grant administrator access?" footer={<><Button variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button><Button variant="primary" onClick={() => confirming && applyRoles(confirming.user, confirming.roleCodes)} disabled={busyId !== null}>{busyId ? "Saving..." : "Confirm"}</Button></>}>
        {confirming && (
          <div className="space-y-3">
            <p className="text-sm text-navy-700"><span className="font-semibold">{confirming.user.fullName}</span> roles will be updated.</p>
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
