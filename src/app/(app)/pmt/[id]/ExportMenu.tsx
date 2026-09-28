"use client";

import React, { useEffect, useRef, useState } from "react";

/** Download menu for the plan. The server decides what goes in each file. */
export function ExportMenu({
  projectId,
  canExportFinancials,
}: {
  projectId: string;
  canExportFinancials: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const download = (query: string, label: string) => {
    setBusy(label);
    setOpen(false);
    // A plain navigation lets the browser handle Content-Disposition,
    // so the file lands in Downloads with the name the server chose.
    window.location.href = `/api/pmt/projects/${projectId}/export?${query}`;
    setTimeout(() => setBusy(""), 2500);
  };

  const options: { label: string; hint: string; query: string }[] = [
    { label: "Excel workbook", hint: "Every table, formatted, one sheet each", query: "format=xlsx" },
    { label: "PDF", hint: "Cover page, Gantt chart and the plan tables", query: "format=pdf" },
    { label: "PowerPoint", hint: "Status deck: health, schedule, milestones, risks", query: "format=pptx" },
    { label: "CSV — work breakdown", hint: "Just the WBS", query: "format=csv&table=wbs" },
    { label: "CSV — milestones", hint: "Just the milestones", query: "format=csv&table=milestones" },
    { label: "CSV — risks", hint: "Just the risks", query: "format=csv&table=risks" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-navy-900 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 hover:border-neutral-300 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? `Preparing ${busy}…` : "Export"}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-[320px] bg-white rounded-xl shadow-lg border border-neutral-50 py-1.5 z-50">
          {options.map((option) => (
            <button
              key={option.query}
              onClick={() => download(option.query, option.label)}
              className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <p className="text-sm text-navy-900">{option.label}</p>
              <p className="text-xs text-navy-500">{option.hint}</p>
            </button>
          ))}

          <div className="px-4 py-2.5 border-t border-neutral-50 mt-1">
            <p className="text-[11px] text-navy-500">
              {canExportFinancials
                ? "Includes budget, hours and invoiced totals."
                : "Cost and invoice figures are left out of your exports."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
