"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Card";
import { Badge, CodeChip } from "@/components/ui/Badge";
import { PurgeProjectDialog } from "@/components/project/ScrapProjectDialog";
import { formatISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface ScrappedProject {
  id: string;
  code: string;
  name: string;
  clientCompanyName?: string | null;
  scrappedAt: string | null;
  scrappedByName: string | null;
  scrapReason: string | null;
  canPurge: boolean;
  purgeBlockers: string[];
  footprint: {
    workPackages: number;
    timesheets: number;
    approvedTimesheets: number;
    invoices: number;
    tickets: number;
    hoursLogged: number;
  };
}

interface ScrapRequest {
  id: string;
  code: string;
  name: string;
  clientCompanyName: string | null;
  requestedAt: string | null;
  requestedByName: string | null;
  reason: string | null;
}

export function ScrappedClient() {
  const [scrapped, setScrapped] = useState<ScrappedProject[]>([]);
  const [requests, setRequests] = useState<ScrapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState<ScrappedProject | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pmt/projects/scrapped");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load the scrapped projects.");
        return;
      }
      setScrapped(data.scrapped ?? []);
      setRequests(data.requests ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "restore" | "withdraw") => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/pmt/projects/${id}/scrap?action=${action}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That did not work.");
        return;
      }
      setNotice(data.message);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className="text-display text-[26px] font-bold leading-tight tracking-[-0.025em] text-navy-900">
            Scrapped Projects
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-snug text-navy-500">
            Out of circulation, with everything they carry kept. Any of these
            can be put back exactly as it was.
          </p>
        </div>
        <Link href="/pmt">
          <Button variant="secondary" size="sm">
            Back to projects
          </Button>
        </Link>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-lg border border-success/20 bg-success-bg px-4 py-3 text-[13px] text-success"
        >
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            className="shrink-0 cursor-pointer font-semibold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          {error}
        </div>
      )}

      {/* ── A PM has asked ────────────────────────────────────── */}
      {requests.length > 0 && (
        <div>
          <SectionHeading description="Waiting on you. Open the project to scrap it, or decline by withdrawing the request.">
            Requested by a project manager
          </SectionHeading>
          <div className="space-y-2.5">
            {requests.map((r) => (
              <Card key={r.id} padding="sm" accent="var(--color-warning)">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CodeChip>{r.code}</CodeChip>
                      <span className="text-[14px] font-semibold text-navy-900">{r.name}</span>
                      <Badge variant="warning" size="sm">
                        Awaiting a decision
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] italic leading-relaxed text-navy-700">
                      &ldquo;{r.reason}&rdquo;
                    </p>
                    <p className="mt-1 text-[11.5px] text-navy-400">
                      {r.requestedByName} · {formatISODate(r.requestedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => act(r.id, "withdraw")}
                      loading={busyId === r.id}
                    >
                      Decline
                    </Button>
                    <Link href={`/pmt/${r.code}`}>
                      <Button size="sm">Open the project</Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Already scrapped ──────────────────────────────────── */}
      <div>
        <SectionHeading
          description={
            scrapped.length > 0
              ? "Nothing here has been deleted. A project holding approved time, invoices or tickets can never be deleted outright — those records outlive it."
              : undefined
          }
        >
          Scrapped
        </SectionHeading>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shimmer h-20 rounded-xl" />
            ))}
          </div>
        ) : scrapped.length === 0 ? (
          <EmptyState
            title="Nothing has been scrapped"
            description="Projects taken out of circulation appear here, with the reason and who did it, ready to be restored."
          />
        ) : (
          <div className="space-y-2.5">
            {scrapped.map((p) => (
              <Card key={p.id} padding="sm" accent="var(--color-navy-300)">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CodeChip>{p.code}</CodeChip>
                      <span className="text-[14px] font-semibold text-navy-900">{p.name}</span>
                      {p.clientCompanyName && (
                        <span className="text-[12.5px] text-navy-400">
                          · {p.clientCompanyName}
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 text-[13px] italic leading-relaxed text-navy-700">
                      &ldquo;{p.scrapReason}&rdquo;
                    </p>
                    <p className="mt-1 text-[11.5px] text-navy-400">
                      Scrapped by {p.scrappedByName} · {formatISODate(p.scrappedAt)}
                    </p>

                    {/* What it is holding — the reason purge is or is not offered. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Kept n={p.footprint.workPackages} one="work package" />
                      <Kept n={p.footprint.timesheets} one="timesheet entry" many="timesheet entries" />
                      <Kept n={p.footprint.invoices} one="invoice" />
                      <Kept n={p.footprint.tickets} one="linked ticket" />
                      {p.footprint.hoursLogged > 0 && (
                        <Badge variant="neutral" size="sm">
                          {p.footprint.hoursLogged}h logged
                        </Badge>
                      )}
                      {p.canPurge && (
                        <Badge variant="neutral" size="sm">
                          nothing attached
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => act(p.id, "restore")}
                      loading={busyId === p.id}
                    >
                      Restore
                    </Button>
                    <button
                      onClick={() => setPurging(p)}
                      disabled={!p.canPurge}
                      title={
                        p.canPurge
                          ? "Delete permanently"
                          : `Cannot be deleted — ${p.purgeBlockers.join("; ")}`
                      }
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-200",
                        p.canPurge
                          ? "cursor-pointer text-danger hover:bg-danger-bg"
                          : "cursor-not-allowed text-navy-300"
                      )}
                    >
                      Delete for good
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {purging && (
        <PurgeProjectDialog
          projectId={purging.id}
          projectCode={purging.code}
          projectName={purging.name}
          blockers={purging.purgeBlockers}
          isOpen
          onClose={() => setPurging(null)}
          onDone={(message) => {
            setNotice(message);
            load();
          }}
        />
      )}
    </div>
  );
}

function Kept({ n, one, many }: { n: number; one: string; many?: string }) {
  if (n <= 0) return null;
  return (
    <Badge variant="neutral" size="sm">
      {n} {n === 1 ? one : many ?? `${one}s`}
    </Badge>
  );
}
