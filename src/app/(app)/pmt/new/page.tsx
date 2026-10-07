"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ManagerField, type PickedManager } from "@/components/project/ManagerPicker";
import { cn, formatCurrency } from "@/lib/utils";

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

interface Draft {
  name: string;
  description: string;
  clientCompanyName: string;
  currentPhase: string;
  startDate: string;
  plannedEndDate: string;
  budgetInr: string;
}

const EMPTY: Draft = {
  name: "",
  description: "",
  clientCompanyName: "",
  currentPhase: "Discovery",
  startDate: "",
  plannedEndDate: "",
  budgetInr: "",
};

function lakhs(value: string): string | null {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e7) return `${(n / 1e7).toFixed(2).replace(/\.?0+$/, "")} crore`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2).replace(/\.?0+$/, "")} lakh`;
  return null;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
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
        if (data && Array.isArray(data.projects)) {
          const names = [...new Set(data.projects.map((p: any) => p.clientCompanyName?.trim()).filter(Boolean))].sort();
          setClientNames(names as string[]);
        }
      })
      .catch(() => {});
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) e.name = "Give the project a name.";
    if (draft.startDate && draft.plannedEndDate && draft.plannedEndDate < draft.startDate) {
      e.plannedEndDate = "The end date is before the start date.";
    }
    if (draft.budgetInr && (!Number.isFinite(Number(draft.budgetInr)) || Number(draft.budgetInr) < 0)) {
      e.budgetInr = "Enter the budget as a number of rupees.";
    }
    return e;
  }, [draft]);
  const valid = Object.keys(errors).length === 0;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!valid) {
      requestAnimationFrame(() => {
        const bad = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        bad?.focus({ preventScroll: true });
      });
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/pmt/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          clientCompanyName: draft.clientCompanyName.trim() || null,
          currentPhase: draft.currentPhase,
          startDate: draft.startDate || null,
          plannedEndDate: draft.plannedEndDate || null,
          budgetInr: draft.budgetInr ? Number(draft.budgetInr) : null,
          managers: managers.map((m) => m.key),
          deliveryManagerUserId: deliveryManager[0]?.key || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.project) throw new Error(data?.error ?? "The project could not be created.");
      
      router.push(`/pmt/${data.project.code}`);
      router.refresh();
    } catch (err) {
      setServerError((err as Error).message);
      setSubmitting(false);
    }
  };

  const show = (key: keyof Draft) => (touched || (key !== "name" && draft[key])) ? errors[key] : undefined;
  const budgetWords = lakhs(draft.budgetInr);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-xl shadow-sm border border-navy-500/10 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-navy-900 mb-2">New project</h1>
        <p className="text-sm text-navy-500 mb-8">
          It gets the next PRJ number and an ITSM context automatically.
        </p>

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
              placeholder="e.g. Cloud ERP Transformation"
              error={show("name")}
              autoComplete="off"
              maxLength={200}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Client company"
                value={draft.clientCompanyName}
                onChange={(e) => set("clientCompanyName", e.target.value)}
                placeholder="Leave blank for internal work"
                list={clientListId}
                autoComplete="off"
                hint={clientNames.length ? "Start typing to reuse an existing client." : undefined}
              />
              <Select
                label="Starting phase"
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
              placeholder="Goals, scope and the business value in a sentence or two"
              rows={2}
              className="min-h-[64px]"
            />
          </Section>

          <Section title="Ownership">
            <div className="grid gap-4 sm:grid-cols-2">
              <ManagerField
                label="Project managers"
                value={managers}
                onChange={setManagers}
                hint="Pick one or more — the first is the lead PM. They can see this project's finances."
              />
              <ManagerField
                label="Delivery manager"
                value={deliveryManager}
                onChange={(m) => setDeliveryManager(m.slice(0, 1))}
                hint="Select the delivery manager for this project."
              />
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
            </div>
          </Section>

          {/* Enter in a text field submits. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />

          <div className="flex justify-end gap-3 pt-4 border-t border-navy-900/10">
            <span className="mr-auto hidden text-[11.5px] text-navy-400 sm:inline flex items-center">
              <kbd className="rounded border border-navy-900/12 bg-surface px-1 font-mono text-[10px] mr-1">Ctrl</kbd> + 
              <kbd className="rounded border border-navy-900/12 bg-surface px-1 font-mono text-[10px] mx-1">Enter</kbd> to create
            </span>
            <Button variant="secondary" onClick={() => router.back()} disabled={submitting} type="button">
              Cancel
            </Button>
            <Button onClick={() => submit()} loading={submitting} disabled={touched && !valid} type="button">
              Create project
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("space-y-4", className)}>
      <legend className="mb-3 flex w-full items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-400">
        {title}
        <span aria-hidden className="h-px flex-1 bg-navy-900/8" />
      </legend>
      {children}
    </fieldset>
  );
}
