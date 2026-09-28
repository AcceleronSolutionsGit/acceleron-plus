"use client";

import React, { useMemo, useState } from "react";
import type { WBSItem, Milestone, WBSStatus, MilestoneStatus } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ColorBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { AssignmentPanel } from "./AssignmentPanel";
import { toDateInput } from "@/lib/dates";

// ─── Shared bits ───────────────────────────────────────────────────

const WBS_STATUS_OPTIONS: { value: WBSStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

const MILESTONE_STATUS_OPTIONS: { value: MilestoneStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "at_risk", label: "At risk" },
  { value: "completed", label: "Completed" },
  { value: "missed", label: "Missed" },
];

const wbsStatusColor: Record<string, string> = {
  not_started: "bg-navy-500/10 text-navy-700",
  in_progress: "bg-blue-500/10 text-blue-700",
  blocked: "bg-red-600/10 text-red-700",
  completed: "bg-emerald-500/10 text-emerald-700",
};

const milestoneStatusColor: Record<string, string> = {
  pending: "bg-navy-500/10 text-navy-700",
  at_risk: "bg-amber-500/10 text-amber-700",
  completed: "bg-emerald-500/10 text-emerald-700",
  missed: "bg-red-600/10 text-red-700",
};

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-navy-900">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700 transition-all"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3"
    >
      {message}
    </div>
  );
}

async function callApi(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Request failed (${res.status}).` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

// ═══════════════════════════════════════════════════════════════════
// WBS editor
// ═══════════════════════════════════════════════════════════════════

interface WBSFormState {
  name: string;
  code: string;
  description: string;
  status: WBSStatus;
  startDate: string;
  endDate: string;
  progressPercent: string;
  estimatedHours: string;
  parentWbsId: string;
}

const emptyWbsForm: WBSFormState = {
  name: "",
  code: "",
  description: "",
  status: "not_started",
  startDate: "",
  endDate: "",
  progressPercent: "0",
  estimatedHours: "",
  parentWbsId: "",
};

export function WBSEditorTab({
  projectId,
  initialItems,
  canManage,
  onOpenComments,
}: {
  projectId: string;
  initialItems: WBSItem[];
  canManage: boolean;
  onOpenComments: (item: WBSItem) => void;
}) {
  // Who is doing a package is a question about the package, so it
  // opens from its own row rather than from a separate screen.
  const [assigning, setAssigning] = useState<WBSItem | null>(null);
  const [items, setItems] = useState<WBSItem[]>(initialItems);
  const [editing, setEditing] = useState<WBSItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<WBSFormState>(emptyWbsForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WBSItem | null>(null);

  const tree = useMemo(() => {
    const byId = new Map<string, WBSItem & { children: WBSItem[] }>();
    items.forEach((i) => byId.set(i.id, { ...i, children: [] }));
    const roots: (WBSItem & { children: WBSItem[] })[] = [];
    byId.forEach((node) => {
      const parent = node.parentWbsId ? byId.get(node.parentWbsId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    const sort = (list: WBSItem[]) => {
      list.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      list.forEach((n) => n.children && sort(n.children));
    };
    sort(roots);
    return roots;
  }, [items]);

  const openCreate = (parentId?: string) => {
    setForm({ ...emptyWbsForm, parentWbsId: parentId ?? "" });
    setError("");
    setCreating(true);
  };

  const openEdit = (item: WBSItem) => {
    setForm({
      name: item.name ?? "",
      code: item.code ?? "",
      description: item.description ?? "",
      status: item.status ?? "not_started",
      startDate: toDateInput(item.startDate),
      endDate: toDateInput(item.endDate),
      progressPercent: String(item.progressPercent ?? 0),
      estimatedHours: item.estimatedHours != null ? String(item.estimatedHours) : "",
      parentWbsId: item.parentWbsId ?? "",
    });
    setError("");
    setEditing(item);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setError("");
  };

  const payload = () => ({
    name: form.name.trim(),
    code: form.code.trim() || undefined,
    description: form.description.trim() || null,
    status: form.status,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    progressPercent: Number(form.progressPercent || 0),
    estimatedHours: form.estimatedHours === "" ? null : Number(form.estimatedHours),
    parentWbsId: form.parentWbsId || null,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("A name is required.");
      return;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setError("The end date cannot fall before the start date.");
      return;
    }

    setBusy(true);
    setError("");

    const result = editing
      ? await callApi(`/api/pmt/projects/${projectId}/wbs/${editing.id}`, "PATCH", payload())
      : await callApi(`/api/pmt/projects/${projectId}/wbs`, "POST", payload());

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const saved = result.data.wbsItem as Record<string, unknown>;
    const mapped: WBSItem = {
      ...(editing ?? ({} as WBSItem)),
      id: String(saved.id),
      projectId,
      code: String(saved.code ?? ""),
      name: String(saved.name ?? ""),
      description: (saved.description as string) ?? undefined,
      sequence: Number(saved.sequence ?? 0),
      status: (saved.status as WBSStatus) ?? "not_started",
      startDate: (saved.start_date as string) ?? undefined,
      endDate: (saved.end_date as string) ?? undefined,
      progressPercent: Number(saved.progress_percent ?? 0),
      estimatedHours: saved.estimated_hours != null ? Number(saved.estimated_hours) : undefined,
      parentWbsId: (saved.parent_wbs_id as string) ?? undefined,
      createdAt: String(saved.created_at ?? new Date().toISOString()),
      updatedAt: String(saved.updated_at ?? new Date().toISOString()),
    };

    setItems((prev) =>
      editing ? prev.map((i) => (i.id === mapped.id ? mapped : i)) : [...prev, mapped]
    );
    closeForm();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const result = await callApi(
      `/api/pmt/projects/${projectId}/wbs/${confirmDelete.id}`,
      "DELETE"
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== confirmDelete.id));
    setConfirmDelete(null);
  };

  const parentOptions = [
    { value: "", label: "— Top level —" },
    ...items
      .filter((i) => !editing || i.id !== editing.id)
      .map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` })),
  ];

  return (
    <>
      <Card padding="none">
        <div className="bg-neutral-50/75 px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">
            Work Breakdown Structure &amp; Deliverable Tasks
          </span>
          {canManage && (
            <Button size="sm" onClick={() => openCreate()}>
              Add work package
            </Button>
          )}
        </div>

        {error && !creating && !editing && (
          <div className="px-5 pt-4">
            <ErrorNote message={error} />
          </div>
        )}

        <div className="divide-y divide-neutral-50">
          {tree.map((item) => (
            <WBSEditorRow
              key={item.id}
              item={item}
              depth={0}
              canManage={canManage}
              onEdit={openEdit}
              onDelete={setConfirmDelete}
              onAddChild={(parent) => openCreate(parent.id)}
              onOpenComments={onOpenComments}
              onOpenAssignments={setAssigning}
            />
          ))}
          {tree.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-navy-900 font-medium">No work packages yet</p>
              <p className="text-xs text-navy-500 mt-1">
                Add the first one to start building the plan and the Gantt chart.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={creating || editing !== null}
        onClose={closeForm}
        title={editing ? `Edit ${editing.code}` : "New work package"}
        className="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && <ErrorNote message={error} />}

          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
            placeholder="e.g. Data migration scripts"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="Auto if left blank"
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as WBSStatus })}
              options={WBS_STATUS_OPTIONS}
            />
          </div>

          <Select
            label="Parent work package"
            value={form.parentWbsId}
            onChange={(v) => setForm({ ...form, parentWbsId: v })}
            options={parentOptions}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start date"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
            <Input
              label="End date"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Progress (%)"
              type="number"
              min={0}
              max={100}
              value={form.progressPercent}
              onChange={(e) => setForm({ ...form, progressPercent: e.target.value })}
            />
            <Input
              label="Estimated hours"
              type="number"
              min={0}
              step="0.5"
              value={form.estimatedHours}
              onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
            />
          </div>

          <Textarea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Scope of this work package…"
          />

          <p className="text-xs text-navy-500">
            Dates set here drive the Gantt chart. Work packages without dates are shown as
            projections.
          </p>
        </form>
      </Modal>

      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete work package"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        {error && <ErrorNote message={error} />}
        <p className="text-sm text-navy-700">
          Delete <span className="font-semibold">{confirmDelete?.code} · {confirmDelete?.name}</span>?
          This cannot be undone.
        </p>
        <p className="text-xs text-navy-500 mt-2">
          Work packages with child items or logged timesheets are protected and will be refused.
        </p>
      </Modal>

      {assigning && (
        <AssignmentPanel
          projectId={projectId}
          wbsItemId={assigning.id}
          wbsName={`${assigning.code} · ${assigning.name}`}
          estimatedHours={assigning.estimatedHours ?? null}
          onClose={() => setAssigning(null)}
          onChanged={(rollup) => {
            // Keep the row in step with the panel: the package's
            // progress is now whatever its people add up to.
            if (!rollup) return;
            setItems((prev) =>
              prev.map((i) =>
                i.id === assigning.id
                  ? {
                      ...i,
                      progressPercent: rollup.progressPercent,
                      assignedHours: rollup.assignedHours,
                      assignedCount: (rollup as { assignedCount?: number }).assignedCount ?? i.assignedCount,
                    }
                  : i
              )
            );
          }}
        />
      )}
    </>
  );
}

function WBSEditorRow({
  item,
  depth,
  canManage,
  onEdit,
  onDelete,
  onAddChild,
  onOpenComments,
  onOpenAssignments,
}: {
  item: WBSItem;
  depth: number;
  canManage: boolean;
  onEdit: (i: WBSItem) => void;
  onDelete: (i: WBSItem) => void;
  onAddChild: (i: WBSItem) => void;
  onOpenComments: (i: WBSItem) => void;
  onOpenAssignments: (i: WBSItem) => void;
}) {
  const progress = item.progressPercent ?? 0;
  const status = item.status ?? "not_started";

  return (
    <>
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-navy-900/[0.02] transition-colors"
        style={{ paddingLeft: `${20 + depth * 24}px` }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="font-mono text-xs text-navy-500 w-14 flex-shrink-0">{item.code}</span>
          <div className="min-w-0">
            <p
              className={`text-sm truncate ${
                depth === 0 ? "font-semibold text-navy-900" : "text-navy-700"
              }`}
            >
              {item.name}
            </p>
            <p className="text-[11px] text-navy-500 mt-0.5">
              {item.startDate && item.endDate
                ? `${formatDate(item.startDate)} → ${formatDate(item.endDate)}`
                : "Not scheduled"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden md:flex items-center gap-2 w-28">
            <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-navy-700 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-navy-500 w-8 text-right">{progress}%</span>
          </div>

          <ColorBadge colorClass={wbsStatusColor[status] ?? wbsStatusColor.not_started}>
            {status.replace(/_/g, " ")}
          </ColorBadge>

          <button
            onClick={() => onOpenAssignments(item)}
            title={
              (item.assignedCount ?? 0) > 0
                ? `${item.assignedCount} ${item.assignedCount === 1 ? "person" : "people"} on this`
                : "Nobody is on this yet"
            }
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              (item.assignedCount ?? 0) > 0
                ? "border-navy-500/30 bg-navy-900/[0.04] text-navy-900"
                : "border-dashed border-neutral-300 text-navy-500/70 hover:border-navy-500/40"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" />
            </svg>
            {(item.assignedCount ?? 0) > 0 ? item.assignedCount : "assign"}
          </button>

          <button
            onClick={() => onOpenComments(item)}
            title="Client comments"
            className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {canManage && (
            <>
              <button
                onClick={() => onAddChild(item)}
                title="Add sub-task"
                className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer text-navy-500 text-xs w-7 h-7 flex items-center justify-center"
              >
                +
              </button>
              <button
                onClick={() => onEdit(item)}
                className="px-2.5 py-1 text-xs font-medium text-navy-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(item)}
                className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-neutral-200 rounded-lg hover:bg-red-600/5 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {item.children?.map((child) => (
        <WBSEditorRow
          key={child.id}
          item={child}
          depth={depth + 1}
          canManage={canManage}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onOpenComments={onOpenComments}
          onOpenAssignments={onOpenAssignments}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Milestones editor
// ═══════════════════════════════════════════════════════════════════

interface MilestoneFormState {
  name: string;
  description: string;
  dueDate: string;
  status: MilestoneStatus;
  isBillingMilestone: boolean;
}

const emptyMilestoneForm: MilestoneFormState = {
  name: "",
  description: "",
  dueDate: "",
  status: "pending",
  isBillingMilestone: false,
};

export function MilestonesEditorTab({
  projectId,
  initialMilestones,
  canManage,
}: {
  projectId: string;
  initialMilestones: Milestone[];
  canManage: boolean;
}) {
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MilestoneFormState>(emptyMilestoneForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Milestone | null>(null);

  const sorted = useMemo(
    () =>
      [...milestones].sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }),
    [milestones]
  );

  const openCreate = () => {
    setForm(emptyMilestoneForm);
    setError("");
    setCreating(true);
  };

  const openEdit = (m: Milestone) => {
    setForm({
      name: m.name ?? "",
      description: m.description ?? "",
      dueDate: toDateInput(m.dueDate),
      status: m.status ?? "pending",
      isBillingMilestone: Boolean(m.isBillingMilestone),
    });
    setError("");
    setEditing(m);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("A name is required.");
      return;
    }

    setBusy(true);
    setError("");

    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      dueDate: form.dueDate || null,
      status: form.status,
      isBillingMilestone: form.isBillingMilestone,
    };

    const result = editing
      ? await callApi(`/api/pmt/projects/${projectId}/milestones/${editing.id}`, "PATCH", body)
      : await callApi(`/api/pmt/projects/${projectId}/milestones`, "POST", body);

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const saved = result.data.milestone as Record<string, unknown>;
    const mapped: Milestone = {
      id: String(saved.id),
      projectId,
      name: String(saved.name ?? ""),
      description: (saved.description as string) ?? undefined,
      dueDate: (saved.due_date as string) ?? undefined,
      status: (saved.status as MilestoneStatus) ?? "pending",
      completedAt: (saved.completed_at as string) ?? undefined,
      isBillingMilestone: Boolean(saved.is_billing_milestone),
      createdAt: String(saved.created_at ?? new Date().toISOString()),
      updatedAt: String(saved.updated_at ?? new Date().toISOString()),
    };

    setMilestones((prev) =>
      editing ? prev.map((m) => (m.id === mapped.id ? mapped : m)) : [...prev, mapped]
    );
    closeForm();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const result = await callApi(
      `/api/pmt/projects/${projectId}/milestones/${confirmDelete.id}`,
      "DELETE"
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMilestones((prev) => prev.filter((m) => m.id !== confirmDelete.id));
    setConfirmDelete(null);
  };

  const isOverdue = (m: Milestone) =>
    Boolean(m.dueDate) && m.status !== "completed" && new Date(m.dueDate!) < new Date();

  return (
    <>
      <Card padding="none">
        <div className="bg-neutral-50/75 px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">
            Milestones
          </span>
          {canManage && (
            <Button size="sm" onClick={openCreate}>
              Add milestone
            </Button>
          )}
        </div>

        {error && !creating && !editing && (
          <div className="px-5 pt-4">
            <ErrorNote message={error} />
          </div>
        )}

        <div className="divide-y divide-neutral-50">
          {sorted.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-navy-900/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-navy-900 truncate">{m.name}</p>
                  {m.isBillingMilestone && (
                    <ColorBadge colorClass="bg-violet-500/10 text-violet-700">Billing</ColorBadge>
                  )}
                </div>
                <p className="text-[11px] text-navy-500 mt-0.5">
                  {m.dueDate ? `Due ${formatDate(m.dueDate)}` : "No due date"}
                  {m.completedAt ? ` · Completed ${formatDate(m.completedAt)}` : ""}
                  {isOverdue(m) ? " · Overdue" : ""}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <ColorBadge
                  colorClass={
                    isOverdue(m)
                      ? milestoneStatusColor.missed
                      : milestoneStatusColor[m.status] ?? milestoneStatusColor.pending
                  }
                >
                  {(isOverdue(m) ? "overdue" : m.status).replace(/_/g, " ")}
                </ColorBadge>

                {canManage && (
                  <>
                    <button
                      onClick={() => openEdit(m)}
                      className="px-2.5 py-1 text-xs font-medium text-navy-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(m)}
                      className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-neutral-200 rounded-lg hover:bg-red-600/5 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {sorted.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-navy-900 font-medium">No milestones defined</p>
              <p className="text-xs text-navy-500 mt-1">
                Milestones appear on the Gantt chart and notify the team when they complete.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={creating || editing !== null}
        onClose={closeForm}
        title={editing ? "Edit milestone" : "New milestone"}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && <ErrorNote message={error} />}

          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
            placeholder="e.g. UAT sign-off"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Due date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as MilestoneStatus })}
              options={MILESTONE_STATUS_OPTIONS}
            />
          </div>

          <Textarea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What has to be true for this milestone to be met?"
          />

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isBillingMilestone}
              onChange={(e) => setForm({ ...form, isBillingMilestone: e.target.checked })}
              className="w-4 h-4 rounded border-navy-500/30 text-navy-900 focus:ring-navy-700/30"
            />
            <span className="text-sm text-navy-900">
              This is a billing milestone
              <span className="block text-xs text-navy-500">
                Completing it prompts the PM to raise an invoice.
              </span>
            </span>
          </label>

          <p className="text-xs text-navy-500">
            Marking a milestone complete stamps the completion time and notifies the PM and sponsor.
          </p>
        </form>
      </Modal>

      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete milestone"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        {error && <ErrorNote message={error} />}
        <p className="text-sm text-navy-700">
          Delete <span className="font-semibold">{confirmDelete?.name}</span>? This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
