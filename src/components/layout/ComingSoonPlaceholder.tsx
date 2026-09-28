import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface ComingSoonPlaceholderProps {
  moduleName: string;
  description?: string;
}

export function ComingSoonPlaceholder({
  moduleName,
  description = "This module is scheduled for Phase 2 rollout. In Phase 1, you can set your skills, request project allocations, and submit weekly timesheets.",
}: ComingSoonPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 max-w-lg mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-200">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center text-3xl shadow-xs">
        <svg className="w-8 h-8 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>

      <div>
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 mb-2.5">
          Phase 2 · Coming Soon
        </span>
        <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          {moduleName}
        </h1>
        <p className="text-sm text-navy-500 mt-2 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
        <Link href="/my-projects">
          <Button variant="primary" size="md">
            Go to My Projects
          </Button>
        </Link>
        <Link href="/my-timesheet">
          <Button variant="secondary" size="md">
            Go to My Timesheet
          </Button>
        </Link>
        <Link href="/my-skills">
          <Button variant="secondary" size="md">
            Go to My Skills
          </Button>
        </Link>
      </div>
    </div>
  );
}
