"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CodeChip } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface ScrapInfo {
  state: {
    scrapped: boolean;
  };
  summary: string;
  canPurge: boolean;
  purgeBlockers: string[];
}

export default function PurgeProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: projectId } = use(params);

  const [projectCode, setProjectCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [info, setInfo] = useState<ScrapInfo | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Fetch project basic details
        const pRes = await fetch(`/api/pmt/projects/${projectId}`);
        const pData = await pRes.json();
        if (pData?.project) {
          setProjectCode(pData.project.code);
          setProjectName(pData.project.name);
        }

        // Fetch scrap info to check purge blockers
        const res = await fetch(`/api/pmt/projects/${projectId}/scrap`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Could not check what is attached to this project.");
          return;
        }
        setInfo(data);
      } catch {
        setError("Could not reach the server.");
      }
    })();
  }, [projectId]);

  const blocked = info ? !info.canPurge : true;
  const confirmed = projectCode && typed.trim().toUpperCase() === projectCode.toUpperCase();

  const purge = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/scrap?action=purge`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not delete this project.");
        return;
      }
      router.push("/pmt/scrapped");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-xl shadow-sm border border-navy-500/10 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-navy-900 mb-2">Delete permanently</h1>
        <p className="text-sm text-navy-500 mb-6">
          This cannot be undone.
        </p>

        <div className="space-y-6">
          <div className="flex items-center gap-2.5 rounded-lg border border-navy-900/8 bg-surface-2 px-3.5 py-2.5">
            <CodeChip>{projectCode || "..."}</CodeChip>
            <span className="min-w-0 truncate text-[13.5px] font-semibold text-navy-900">
              {projectName || "Loading..."}
            </span>
          </div>

          {info ? (
            blocked ? (
              <div className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3">
                <p className="text-[13px] font-semibold text-danger">
                  This one cannot be deleted permanently.
                </p>
                <ul className="mt-2 space-y-1">
                  {info.purgeBlockers.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[12.5px] text-danger/90">
                      <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" />
                      {b}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[12px] leading-snug text-danger/80">
                  Those outlive the project they happened on. It will stay scrapped
                  instead, which keeps them and still takes it out of every list.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-[13px] leading-relaxed text-danger">
                  Nothing is attached to this project, so there is nothing to lose —
                  but the row and its plan go for good and there is no restoring it.
                </div>

                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold text-navy-700">
                    Type <span className="font-mono text-navy-900">{projectCode}</span> to
                    confirm
                  </span>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(
                      "font-mono h-10 w-full rounded-lg border bg-surface px-4 text-sm tracking-wide text-navy-900",
                      "transition-[border-color,box-shadow] duration-200",
                      "focus:outline-none focus:shadow-[0_0_0_3px_rgb(192_57_43_/_0.14)]",
                      confirmed
                        ? "border-success focus:border-success"
                        : "border-navy-900/14 focus:border-danger"
                    )}
                  />
                </label>
              </>
            )
          ) : (
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-navy-200 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-navy-200 rounded"></div>
                  <div className="h-4 bg-navy-200 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-[13px] text-danger"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-navy-900/10">
          <Button variant="secondary" onClick={() => router.back()} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={purge}
            loading={busy}
            disabled={blocked || !confirmed}
          >
            Delete {projectCode || "project"} for good
          </Button>
        </div>
      </div>
    </div>
  );
}
