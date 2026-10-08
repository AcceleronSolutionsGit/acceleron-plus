"use client";

import React, { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ManagerField, type PickedManager } from "@/components/project/ManagerPicker";
import { cn, formatCurrency } from "@/lib/utils";
import { toDateInput } from "@/lib/dates";
import { Project } from "@/lib/types";

const PHASES = [
  "Discovery",
  "Design",
  "Build",
  "Execution",
  "Testing",
  "UAT",
  "Go-Live",
  "Closure",
];

const STATUSES = [
  { value: "initiated", label: "Initiated" },
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

function lakhs(value: string): string | null {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e7) return `${(n / 1e7).toFixed(2).replace(/\.?0+$/, "")} crore`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2).replace(/\.?0+$/, "")} lakh`;
  return null;
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4", className)}>
      <h2 className="text-sm font-bold uppercase tracking-widest text-navy-400">{title}</h2>
      {children}
    </section>
  );
}

export function ProjectEditClient({ project, permissions }: { project: Project, permissions: any }) {
  const router = useRouter();

  const [draft, setDraft] = useState({
    name: project.name,
    description: project.description || "",
    clientCompanyName: project.clientCompanyName || "",
    status: project.status,
    currentPhase: project.currentPhase || "Discovery",
    budgetInr: project.budgetInr ? String(project.budgetInr) : "",
    startDate: toDateInput(project.startDate),
    plannedEndDate: toDateInput(project.plannedEndDate),
    classification: project.classification || "non_group",
    zohoSalesOrderRef: project.zohoSalesOrderRef || "",
    poDetails: project.poDetails || "",
  });

  const [managers, setManagers] = useState<PickedManager[]>([]);
  const [deliveryManager, setDeliveryManager] = useState<PickedManager[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [clientNames, setClientNames] = useState<string[]>([]);
  const clientListId = useId();

  useEffect(() => {
    fetch("/api/pmt/projects")
      .then((res) => res.json())
      .then((data) => {
        if (!data?.projects) return;
        const set = new Set<string>();
        for (const p of data.projects) {
          if (p.clientCompanyName) set.add(p.clientCompanyName);
        }
        setClientNames(Array.from(set).sort());
      })
      .catch(() => null);
  }, []);

  // Initialize managers if they already exist
  useEffect(() => {
    fetch("/api/pmt/people")
      .then((res) => res.json())
      .then((data) => {
        if (!data?.people) return;
        
        if (project.projectManagerUserId) {
          const pm = data.people.find((p: any) => p.userId === project.projectManagerUserId || p.key === project.projectManagerUserId);
          if (pm) setManagers([pm]);
        }
        
        if (project.deliveryManagerUserId) {
          const dm = data.people.find((p: any) => p.userId === project.deliveryManagerUserId || p.key === project.deliveryManagerUserId);
          if (dm) setDeliveryManager([dm]);
        }
      })
      .catch(() => null);
  }, [project.projectManagerUserId, project.deliveryManagerUserId]);

  const set = (key: keyof typeof draft, val: string) => {
    setDraft((d) => ({ ...d, [key]: val }));
    setTouched(true);
  };

  const show = (key: keyof typeof draft) => {
    if (!touched && !submitting) return undefined;
    if (key === "name" && !draft.name.trim()) return "Name is required";
    if (key === "plannedEndDate" && draft.startDate && draft.plannedEndDate && draft.plannedEndDate < draft.startDate) {
      return "End date must be after start date";
    }
    return undefined;
  };

  const isValid = !show("name") && !show("plannedEndDate");

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!isValid) return;

    setSubmitting(true);
    setServerError(null);

    try {
      const payload: Record<string, any> = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        clientCompanyName: draft.clientCompanyName.trim() || null,
        status: draft.status,
        currentPhase: draft.currentPhase,
        classification: draft.classification,
        zohoSalesOrderRef: draft.zohoSalesOrderRef.trim() || null,
        poDetails: draft.poDetails.trim() || null,
        startDate: draft.startDate || null,
        plannedEndDate: draft.plannedEndDate || null,
      };

      if (permissions.canChangeProjectManager) {
        payload.projectManagerUserId = managers[0]?.key || null;
        payload.deliveryManagerUserId = deliveryManager[0]?.key || null;
      }
      if (permissions.canViewFinancials) {
        payload.budgetInr = draft.budgetInr ? Number(draft.budgetInr) : null;
      }

      const res = await fetch(`/api/pmt/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        throw new Error(data?.error || "Could not save project");
      }

      router.push(`/pmt/${project.id}`);
      router.refresh();
    } catch (err: any) {
      setServerError(err.message || "A network error occurred.");
      setSubmitting(false);
    }
  };

  const budgetWords = lakhs(draft.budgetInr);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-surface-2 md:flex-row">
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8">
            <button
              onClick={() => router.back()}
              className="group mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-navy-400 hover:text-navy-900 transition-colors"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 12L6 8l4-4" />
              </svg>
              Cancel edit
            </button>
            <h1 className="text-2xl font-bold tracking-tight text-navy-900">
              Edit Project: {project.code}
            </h1>
          </div>

          <form
            onSubmit={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
            }}
            className="space-y-8"
            noValidate
          >
            {serverError && (
              <div role="alert" className="rounded-lg border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">
                {serverError}
              </div>
            )}

            <Section title="The project">
              <Input
                label="Project name"
                required
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                error={show("name")}
                autoComplete="off"
                maxLength={200}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Status"
                  value={draft.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Classification"
                  value={draft.classification}
                  onChange={(e) => set("classification", e.target.value)}
                >
                  <option value="group">Group</option>
                  <option value="non_group">Non-Group</option>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Client company"
                  value={draft.clientCompanyName}
                  onChange={(e) => set("clientCompanyName", e.target.value)}
                  placeholder="Leave blank for internal work"
                  list={clientListId}
                  autoComplete="off"
                />
                <Select
                  label="Delivery phase"
                  value={draft.currentPhase}
                  onChange={(e) => set("currentPhase", e.target.value)}
                >
                  {PHASES.map((ph) => (
                    <option key={ph} value={ph}>
                      {ph}
                    </option>
                  ))}
                </Select>
              </div>
              <datalist id={clientListId}>
                {clientNames.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Textarea
                label="Description"
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Goals, scope and the business value"
                rows={3}
              />
            </Section>

            <Section title="Commercial references">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Zoho Sales Order No"
                  value={draft.zohoSalesOrderRef}
                  onChange={(e) => set("zohoSalesOrderRef", e.target.value)}
                  placeholder="e.g. SO-12345"
                  autoComplete="off"
                />
                <Input
                  label="PO Details"
                  value={draft.poDetails}
                  onChange={(e) => set("poDetails", e.target.value)}
                  placeholder="PO number or details"
                  autoComplete="off"
                />
              </div>
            </Section>

            <Section title="Ownership">
              <div className="grid gap-4 sm:grid-cols-2">
                {permissions.canChangeProjectManager ? (
                  <>
                    <ManagerField
                      label="Lead PM"
                      value={managers}
                      onChange={(m) => setManagers(m.slice(0, 1))}
                      hint="Select the lead project manager."
                    />
                    <ManagerField
                      label="Delivery manager"
                      value={deliveryManager}
                      onChange={(m) => setDeliveryManager(m.slice(0, 1))}
                      hint="Select the delivery manager."
                    />
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-navy-700 mb-1">Lead PM</label>
                      <div className="px-3 py-2 border rounded bg-gray-50 text-gray-500 text-sm">
                        {project.projectManager?.fullName || "Unassigned"}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-navy-700 mb-1">Delivery Manager</label>
                      <div className="px-3 py-2 border rounded bg-gray-50 text-gray-500 text-sm">
                        {project.deliveryManagerUserId ? "Assigned" : "Unassigned"}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Section>

            <Section title="Schedule & budget">
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Start date"
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
                <Input
                  label="Planned end"
                  type="date"
                  value={draft.plannedEndDate}
                  min={draft.startDate || undefined}
                  onChange={(e) => set("plannedEndDate", e.target.value)}
                  error={show("plannedEndDate")}
                />
                {permissions.canViewFinancials ? (
                  <Input
                    label="Budget"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    leading="₹"
                    value={draft.budgetInr}
                    onChange={(e) => set("budgetInr", e.target.value)}
                    placeholder="0"
                    error={show("budgetInr")}
                    hint={
                      draft.budgetInr && Number(draft.budgetInr) > 0
                        ? `${formatCurrency(Number(draft.budgetInr))}${budgetWords ? ` · ${budgetWords}` : ""}`
                        : undefined
                    }
                  />
                ) : (
                   <div>
                     <label className="block text-sm font-medium text-navy-700 mb-1">Budget</label>
                     <div className="px-3 py-2 border rounded bg-gray-50 text-gray-500 text-sm">
                       Hidden
                     </div>
                   </div>
                )}
              </div>
            </Section>

            <div className="flex items-center justify-end gap-3 border-t border-navy-900/10 pt-6">
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
