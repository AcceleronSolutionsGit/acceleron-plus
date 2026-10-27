"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";

export interface ProjectTypeItem {
  id: string;
  categoryId: string | null;
  categoryCode?: string | null;
  name: string;
  code: string | null;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCategoryItem {
  id: string;
  code: string;
  name: string;
  label: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  projectCount: number;
  types: ProjectTypeItem[];
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SAP: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  SOFTWARE: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  SUPPORT: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  INFRA: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  ZOHO: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  LICENCE: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  AUDIT: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  OTHER: { bg: "bg-neutral-50", text: "text-neutral-700", border: "border-neutral-200" },
};

export function ProjectCategoriesTab() {
  const [categories, setCategories] = useState<ProjectCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Category Modal State
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProjectCategoryItem | null>(null);
  const [catFormData, setCatFormData] = useState({
    name: "",
    code: "",
    label: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  });
  const [catFormError, setCatFormError] = useState("");
  const [isSavingCat, setIsSavingCat] = useState(false);

  // Project Type Modal State
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<ProjectTypeItem | null>(null);
  const [typeFormData, setTypeFormData] = useState({
    name: "",
    code: "",
    categoryId: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  });
  const [typeFormError, setTypeFormError] = useState("");
  const [isSavingType, setIsSavingType] = useState(false);

  // Deletion feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/masters/project-categories");
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories || []);
        // Expand all categories by default on first load
        const initExpanded: Record<string, boolean> = {};
        (data.categories || []).forEach((c: ProjectCategoryItem) => {
          initExpanded[c.id] = true;
        });
        setExpandedCategories(initExpanded);
      }
    } catch (err) {
      console.error("Failed to load project categories:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // ── Category Handlers ──────────────────────────────────────────────────
  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCatFormData({
      name: "",
      code: "",
      label: "",
      description: "",
      displayOrder: categories.length + 1,
      isActive: true,
    });
    setCatFormError("");
    setIsCatModalOpen(true);
  };

  const openEditCategoryModal = (cat: ProjectCategoryItem) => {
    setEditingCategory(cat);
    setCatFormData({
      name: cat.name,
      code: cat.code,
      label: cat.label || cat.name,
      description: cat.description || "",
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
    });
    setCatFormError("");
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catFormData.name.trim()) {
      setCatFormError("Category name is required.");
      return;
    }

    setIsSavingCat(true);
    setCatFormError("");

    try {
      const url = editingCategory
        ? `/api/admin/masters/project-categories/${editingCategory.id}`
        : "/api/admin/masters/project-categories";
      const method = editingCategory ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: catFormData.name.trim(),
          code: catFormData.code.trim() || catFormData.name.toUpperCase().replace(/\s+/g, "_"),
          label: catFormData.label.trim() || catFormData.name.trim(),
          description: catFormData.description.trim() || null,
          displayOrder: Number(catFormData.displayOrder) || 0,
          isActive: catFormData.isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setCatFormError(data.error || "Failed to save category.");
        return;
      }

      setIsCatModalOpen(false);
      showToast(editingCategory ? `Category "${catFormData.name}" updated!` : `Category "${catFormData.name}" created!`);
      await loadData();
    } catch {
      setCatFormError("Network error. Please try again.");
    } finally {
      setIsSavingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: ProjectCategoryItem) => {
    const confirmMsg = cat.projectCount > 0
      ? `Category "${cat.name}" has ${cat.projectCount} active projects assigned. Deleting will deactivate it. Proceed?`
      : `Are you sure you want to permanently delete category "${cat.name}" and its project types?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/admin/masters/project-categories/${cat.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete category.");
        return;
      }
      showToast(data.message || `Category "${cat.name}" removed.`);
      await loadData();
    } catch {
      alert("Network error deleting category.");
    }
  };

  // ── Project Type Handlers ──────────────────────────────────────────────
  const openAddTypeModal = (defaultCategoryId?: string) => {
    setEditingType(null);
    const targetCatId = defaultCategoryId || categories[0]?.id || "";
    setTypeFormData({
      name: "",
      code: "",
      categoryId: targetCatId,
      description: "",
      displayOrder: 1,
      isActive: true,
    });
    setTypeFormError("");
    setIsTypeModalOpen(true);
  };

  const openEditTypeModal = (t: ProjectTypeItem) => {
    setEditingType(t);
    setTypeFormData({
      name: t.name,
      code: t.code || "",
      categoryId: t.categoryId || "",
      description: t.description || "",
      displayOrder: t.displayOrder,
      isActive: t.isActive,
    });
    setTypeFormError("");
    setIsTypeModalOpen(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeFormData.name.trim()) {
      setTypeFormError("Project type name is required.");
      return;
    }
    if (!typeFormData.categoryId) {
      setTypeFormError("Please select a parent category.");
      return;
    }

    setIsSavingType(true);
    setTypeFormError("");

    try {
      const url = editingType
        ? `/api/admin/masters/project-types/${editingType.id}`
        : "/api/admin/masters/project-types";
      const method = editingType ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: typeFormData.name.trim(),
          code: typeFormData.code.trim() || typeFormData.name.toUpperCase().replace(/\s+/g, "_"),
          categoryId: typeFormData.categoryId,
          description: typeFormData.description.trim() || null,
          displayOrder: Number(typeFormData.displayOrder) || 0,
          isActive: typeFormData.isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setTypeFormError(data.error || "Failed to save project type.");
        return;
      }

      setIsTypeModalOpen(false);
      showToast(editingType ? `Project type "${typeFormData.name}" updated!` : `Project type "${typeFormData.name}" created!`);
      await loadData();
    } catch {
      setTypeFormError("Network error. Please try again.");
    } finally {
      setIsSavingType(false);
    }
  };

  const handleDeleteType = async (t: ProjectTypeItem) => {
    if (!confirm(`Are you sure you want to delete project type "${t.name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/masters/project-types/${t.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete project type.");
        return;
      }
      showToast(data.message || `Project type "${t.name}" removed.`);
      await loadData();
    } catch {
      alert("Network error deleting project type.");
    }
  };

  // ── Filters & Search ───────────────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => {
        if (statusFilter === "active") return cat.isActive;
        if (statusFilter === "inactive") return !cat.isActive;
        return true;
      })
      .filter((cat) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const matchesCat =
          cat.name.toLowerCase().includes(q) ||
          cat.code.toLowerCase().includes(q) ||
          (cat.label && cat.label.toLowerCase().includes(q)) ||
          (cat.description && cat.description.toLowerCase().includes(q));

        const matchesType = cat.types?.some(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.code && t.code.toLowerCase().includes(q)) ||
            (t.description && t.description.toLowerCase().includes(q))
        );

        return matchesCat || matchesType;
      });
  }, [categories, statusFilter, searchQuery]);

  const totalTypesCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + (c.types?.length || 0), 0);
  }, [categories]);

  const totalProjectsCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + (c.projectCount || 0), 0);
  }, [categories]);

  return (
    <div className="p-6 space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-navy-950 px-4 py-3 text-sm font-medium text-white shadow-xl flex items-center gap-2 border border-navy-800 animate-in fade-in slide-in-from-bottom-2">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-navy-900/10 bg-surface p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Total Categories</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900">{categories.length}</span>
            <span className="text-xs font-semibold text-emerald-600">
              ({categories.filter((c) => c.isActive).length} active)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-navy-900/10 bg-surface p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Total Project Types</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900">{totalTypesCount}</span>
            <span className="text-xs text-navy-500">defined across categories</span>
          </div>
        </div>

        <div className="rounded-xl border border-navy-900/10 bg-surface p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Assigned Projects</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900">{totalProjectsCount}</span>
            <span className="text-xs text-navy-500">live across PMT</span>
          </div>
        </div>

        <div className="rounded-xl border border-navy-900/10 bg-surface p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Quick Actions</div>
            <div className="mt-1 text-xs text-navy-500">Add masters data</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAddTypeModal()}
              className="px-2.5 py-1.5 text-xs font-semibold text-navy-800 bg-surface-2 border border-navy-900/15 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              + Type
            </button>
            <button
              onClick={openAddCategoryModal}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 transition-colors shadow-2xs"
            >
              + Category
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-navy-900/10 shadow-xs">
        <div className="flex-1 flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category, code, or project type…"
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none bg-neutral-50/50"
            />
            <svg
              className="w-4 h-4 text-navy-400 absolute left-3 top-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white text-navy-800"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="px-2.5 py-1 text-xs font-semibold text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-md"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              const allOpen = Object.values(expandedCategories).every(Boolean);
              const next: Record<string, boolean> = {};
              categories.forEach((c) => {
                next[c.id] = !allOpen;
              });
              setExpandedCategories(next);
            }}
            className="px-3 py-1.5 text-xs font-medium text-navy-600 hover:text-navy-900 hover:bg-neutral-100 rounded-lg border border-transparent transition-colors"
          >
            {Object.values(expandedCategories).every(Boolean) ? "Collapse All" : "Expand All"}
          </button>
        </div>
      </div>

      {/* Main Hierarchical List */}
      {loading ? (
        <div className="p-12 text-center text-sm text-navy-400">Loading categories and project types…</div>
      ) : filteredCategories.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-navy-900/15 bg-surface text-navy-400">
          <p className="font-semibold text-navy-800">No project categories found</p>
          <p className="text-xs mt-1">Try adjusting your search or add a new category to get started.</p>
          <button
            onClick={openAddCategoryModal}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 transition-colors"
          >
            Create Category
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCategories.map((cat) => {
            const isExpanded = expandedCategories[cat.id] ?? true;
            const theme = CATEGORY_COLORS[cat.code] || CATEGORY_COLORS.OTHER;

            return (
              <div
                key={cat.id}
                className="overflow-hidden rounded-xl border border-navy-900/10 bg-surface shadow-xs transition-[border-color,box-shadow]"
              >
                {/* Category Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 bg-neutral-50/70 border-b border-navy-900/8">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => toggleCategoryExpand(cat.id)}
                      className="p-1 text-navy-400 hover:text-navy-900 hover:bg-neutral-200/60 rounded-md transition-colors"
                      title={isExpanded ? "Collapse types" : "Expand types"}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${theme.bg} ${theme.text} ${theme.border}`}>
                        {cat.code}
                      </span>
                      <span className="font-bold text-navy-950 text-base">{cat.name}</span>
                      {cat.label && cat.label !== cat.name && (
                        <span className="text-xs text-navy-400 font-medium">({cat.label})</span>
                      )}
                      {!cat.isActive && (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                    {/* Project Usage Badge */}
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-navy-700 border border-neutral-200"
                      title="Number of projects linked to this category"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {cat.projectCount} {cat.projectCount === 1 ? "project" : "projects"}
                    </span>

                    {/* Types Count */}
                    <span className="text-xs text-navy-400 font-medium">
                      {cat.types?.length || 0} {cat.types?.length === 1 ? "type" : "types"}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 border-l border-navy-900/10 pl-2">
                      <button
                        onClick={() => openAddTypeModal(cat.id)}
                        className="p-1.5 text-navy-600 hover:text-navy-900 hover:bg-white rounded-md transition-colors text-xs font-medium flex items-center gap-1"
                        title="Add Project Type to this category"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="hidden md:inline">Add Type</span>
                      </button>

                      <button
                        onClick={() => openEditCategoryModal(cat)}
                        className="p-1.5 text-navy-600 hover:text-navy-900 hover:bg-white rounded-md transition-colors"
                        title="Edit category"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>

                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors"
                        title="Delete or deactivate category"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Category Description */}
                {cat.description && (
                  <div className="px-4 py-2 bg-neutral-50/40 border-b border-navy-900/6 text-xs text-navy-500 italic">
                    {cat.description}
                  </div>
                )}

                {/* Sub-types Table */}
                {isExpanded && (
                  <div className="p-0">
                    {!cat.types || cat.types.length === 0 ? (
                      <div className="py-6 px-4 text-center text-xs text-navy-400">
                        No project types under this category.{" "}
                        <button
                          onClick={() => openAddTypeModal(cat.id)}
                          className="text-navy-900 underline font-semibold ml-1"
                        >
                          Add the first one
                        </button>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-navy-900/6 bg-neutral-50/30 text-[10px] font-bold uppercase tracking-wider text-navy-400">
                            <th className="py-2.5 px-4 font-semibold">Type Name</th>
                            <th className="py-2.5 px-4 font-semibold">Code</th>
                            <th className="py-2.5 px-4 font-semibold">Description</th>
                            <th className="py-2.5 px-4 font-semibold">Order</th>
                            <th className="py-2.5 px-4 font-semibold">Status</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-navy-900/6">
                          {cat.types.map((pt) => (
                            <tr key={pt.id} className="hover:bg-neutral-50/60 transition-colors group">
                              <td className="py-3 px-4 font-semibold text-navy-900">
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-navy-400" />
                                  {pt.name}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {pt.code ? (
                                  <span className="font-mono text-[11px] font-medium bg-neutral-100 text-navy-700 px-1.5 py-0.5 rounded border border-neutral-200">
                                    {pt.code}
                                  </span>
                                ) : (
                                  <span className="text-navy-300">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-navy-600 max-w-sm truncate">
                                {pt.description || <span className="text-navy-300 italic">No description</span>}
                              </td>
                              <td className="py-3 px-4 text-navy-500 font-mono text-[11px]">
                                {pt.displayOrder}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    pt.isActive
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                                  }`}
                                >
                                  {pt.isActive ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5 opacity-90 group-hover:opacity-100">
                                  <button
                                    onClick={() => openEditTypeModal(pt)}
                                    className="p-1 text-navy-600 hover:text-navy-900 hover:bg-neutral-100 rounded transition-colors"
                                    title="Edit project type"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteType(pt)}
                                    className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors"
                                    title="Delete project type"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Category Modal (Add / Edit) ─────────────────────────────────── */}
      <Modal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
        title={editingCategory ? "Edit Category" : "Add Project Category"}
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          {catFormError && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {catFormError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
              Category Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={catFormData.name}
              onChange={(e) => {
                const val = e.target.value;
                setCatFormData((prev) => ({
                  ...prev,
                  name: val,
                  code: editingCategory ? prev.code : val.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
                  label: editingCategory ? prev.label : val,
                }));
              }}
              placeholder="e.g. SAP, Software, IT Infrastructure"
              className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
                Code / Key <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={catFormData.code}
                onChange={(e) =>
                  setCatFormData((prev) => ({
                    ...prev,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]+/g, "_"),
                  }))
                }
                placeholder="e.g. SAP, SOFTWARE"
                className="w-full px-3 py-2 text-sm font-mono border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
                Display Label
              </label>
              <input
                type="text"
                value={catFormData.label}
                onChange={(e) => setCatFormData((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="e.g. SAP Solutions"
                className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={catFormData.description}
              onChange={(e) => setCatFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of practice or delivery focus"
              className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
                Display Order
              </label>
              <input
                type="number"
                value={catFormData.displayOrder}
                onChange={(e) => setCatFormData((prev) => ({ ...prev, displayOrder: parseInt(e.target.value, 10) || 0 }))}
                className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>
            <div className="pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={catFormData.isActive}
                  onChange={(e) => setCatFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border-navy-400 text-navy-900 focus:ring-navy-900 w-4 h-4"
                />
                <span className="text-sm font-semibold text-navy-800">Active</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-navy-900/10">
            <button
              type="button"
              onClick={() => setIsCatModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-navy-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingCat}
              className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSavingCat ? "Saving…" : editingCategory ? "Update Category" : "Create Category"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Project Type Modal (Add / Edit) ─────────────────────────────── */}
      <Modal
        isOpen={isTypeModalOpen}
        onClose={() => setIsTypeModalOpen(false)}
        title={editingType ? "Edit Project Type" : "Add Project Type"}
      >
        <form onSubmit={handleSaveType} className="space-y-4">
          {typeFormError && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {typeFormError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
              Parent Category <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={typeFormData.categoryId}
              onChange={(e) => setTypeFormData((prev) => ({ ...prev, categoryId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white text-navy-800"
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
              Project Type Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={typeFormData.name}
              onChange={(e) => {
                const val = e.target.value;
                setTypeFormData((prev) => ({
                  ...prev,
                  name: val,
                  code: editingType ? prev.code : val.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
                }));
              }}
              placeholder="e.g. SAP S/4HANA Migration, Software AMS"
              className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
              Code / Identifier
            </label>
            <input
              type="text"
              value={typeFormData.code}
              onChange={(e) =>
                setTypeFormData((prev) => ({
                  ...prev,
                  code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]+/g, "_"),
                }))
              }
              placeholder="e.g. SAP_S4_MIG"
              className="w-full px-3 py-2 text-sm font-mono border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={typeFormData.description}
              onChange={(e) => setTypeFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Scope details and characteristics of this project type"
              className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-bold text-navy-800 uppercase tracking-wider mb-1">
                Display Order
              </label>
              <input
                type="number"
                value={typeFormData.displayOrder}
                onChange={(e) => setTypeFormData((prev) => ({ ...prev, displayOrder: parseInt(e.target.value, 10) || 0 }))}
                className="w-full px-3 py-2 text-sm border border-navy-500/20 rounded-lg focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>
            <div className="pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typeFormData.isActive}
                  onChange={(e) => setTypeFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border-navy-400 text-navy-900 focus:ring-navy-900 w-4 h-4"
                />
                <span className="text-sm font-semibold text-navy-800">Active</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-navy-900/10">
            <button
              type="button"
              onClick={() => setIsTypeModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-navy-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingType}
              className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSavingType ? "Saving…" : editingType ? "Update Type" : "Create Type"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
