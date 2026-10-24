"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";

interface CustomRole {
  id: string;
  projectId: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  name: string;
  code: string;
  description: string | null;
  baseRole: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectOption {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  projectType?: string | null;
}

export function ProjectRolesTab() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("all");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    baseRole: "Developer",
    projectId: "",
    isActive: true,
  });
  const [formError, setFormError] = useState("");

  const loadRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/masters/project-roles");
      const data = await res.json();
      if (data.success) {
        setRoles(data.roles ?? []);
        setProjects(data.projects ?? []);
      }
    } catch (err) {
      console.error("Failed to load project custom roles:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoles();
  }, []);

  const openAddModal = () => {
    setEditingRole(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      baseRole: "Developer",
      projectId: "",
      isActive: true,
    });
    setFormError("");
    setIsAddModalOpen(true);
  };

  const openEditModal = (role: CustomRole) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      code: role.code,
      description: role.description || "",
      baseRole: role.baseRole || "Developer",
      projectId: role.projectId || "",
      isActive: role.isActive,
    });
    setFormError("");
    setIsAddModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    setFormData((prev) => ({
      ...prev,
      name: val,
      code: editingRole ? prev.code : slug,
    }));
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError("Role name is required.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const url = editingRole
        ? `/api/admin/masters/project-roles/${editingRole.id}`
        : "/api/admin/masters/project-roles";
      const method = editingRole ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          code: formData.code.trim() || formData.name.toLowerCase().replace(/\s+/g, "_"),
          description: formData.description.trim() || null,
          baseRole: formData.baseRole,
          projectId: formData.projectId ? formData.projectId : null,
          isActive: formData.isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Failed to save role.");
        return;
      }

      setIsAddModalOpen(false);
      await loadRoles();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async (role: CustomRole) => {
    if (!confirm(`Are you sure you want to delete role "${role.name}"?`)) return;
    setDeletingId(role.id);
    try {
      const res = await fetch(`/api/admin/masters/project-roles/${role.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete role.");
        return;
      }
      await loadRoles();
    } catch {
      alert("Network error deleting role.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      const matchesSearch =
        searchQuery === "" ||
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.projectName && r.projectName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesProject =
        selectedProjectFilter === "all" ||
        (selectedProjectFilter === "global" && !r.projectId) ||
        r.projectId === selectedProjectFilter;

      return matchesSearch && matchesProject;
    });
  }, [roles, searchQuery, selectedProjectFilter]);

  return (
    <div className="p-6 space-y-5">
      {/* Header and Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search custom roles, codes, or descriptions…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-navy-500/20 rounded-xl focus:ring-2 focus:ring-navy-900 focus:outline-none bg-neutral-50/50"
            />
            <svg
              className="w-4 h-4 text-navy-400 absolute left-3 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {/* Scope filter */}
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-navy-500/20 rounded-xl focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white text-navy-800"
          >
            <option value="all">All Project Scopes</option>
            <option value="global">Global (Available to all projects)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>

          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedProjectFilter("all");
              }}
              className="px-3 py-1.5 text-xs font-semibold text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-lg"
            >
              Reset
            </button>
          )}
        </div>

        {/* Add Role CTA */}
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 text-white rounded-xl text-sm font-semibold hover:bg-navy-800 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>Add Custom Project Role</span>
        </button>
      </div>

      {/* Roles Data Table */}
      <div className="border border-navy-500/10 rounded-xl overflow-hidden bg-white shadow-sm relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white text-xs font-medium rounded-lg shadow-lg">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Loading custom roles...</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50/80 border-b border-navy-500/10 text-xs font-semibold text-navy-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Role Name &amp; Code</th>
                <th className="px-4 py-3.5">Scope / Project</th>
                <th className="px-4 py-3.5">Base Responsibility</th>
                <th className="px-4 py-3.5">Description</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500/10">
              {filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-navy-500">
                    <p className="font-medium text-navy-700">No custom roles found</p>
                    <p className="text-xs text-navy-400 mt-1">
                      Create roles like Scrum Master, DevOps Engineer, or Solution Architect scoped globally or to individual projects.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRoles.map((role) => (
                  <tr key={role.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <div>
                        <div className="font-bold text-navy-900">{role.name}</div>
                        <div className="text-[11px] font-mono text-navy-500">{role.code}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {role.projectId ? (
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded w-max">
                            {role.projectCode}
                          </span>
                          <span className="text-[11px] text-navy-500 mt-0.5 truncate max-w-[180px]">
                            {role.projectName}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                          🌐 All Projects (Global)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium text-navy-700 px-2 py-0.5 bg-neutral-100 rounded">
                        {role.baseRole}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs text-navy-600 max-w-xs line-clamp-2">
                        {role.description || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      {role.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-navy-500 border border-neutral-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(role)}
                          className="px-2.5 py-1 text-xs font-medium text-navy-700 hover:text-navy-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRole(role)}
                          disabled={deletingId === role.id}
                          className="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deletingId === role.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add/Edit Custom Role */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingRole ? `Edit Role: ${editingRole.name}` : "Create Custom Project Role"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveRole}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-xl disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              <span>{editingRole ? "Save Changes" : "Create Role"}</span>
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveRole} className="space-y-4 text-sm">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Role Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. DevOps Engineer, Scrum Master, Solution Architect"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Role Code *</label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g. devops_engineer"
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Base Responsibility</label>
              <select
                value={formData.baseRole}
                onChange={(e) => setFormData({ ...formData, baseRole: e.target.value })}
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white text-navy-800"
              >
                <option value="Developer">Developer (Timesheets &amp; tasks)</option>
                <option value="Team Lead">Team Lead (WBS &amp; plan editing)</option>
                <option value="PM">PM (Full management &amp; finances)</option>
                <option value="Delivery Manager">Delivery Manager (Portfolio oversight)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Project Scope</label>
            <select
              value={formData.projectId}
              onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white text-navy-800"
            >
              <option value="">🌐 Global — Available across all projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} {p.projectType ? `(${p.projectType})` : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-navy-400 mt-1">
              Choose &quot;Global&quot; to make this role selectable on every project, or bind it exclusively to a specific project.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the duties, skills, or responsibilities associated with this role..."
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="role-is-active"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-neutral-300 text-navy-900 focus:ring-navy-900"
            />
            <label htmlFor="role-is-active" className="text-xs font-medium text-navy-800 cursor-pointer">
              Active role (enabled for team staffing selections)
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
