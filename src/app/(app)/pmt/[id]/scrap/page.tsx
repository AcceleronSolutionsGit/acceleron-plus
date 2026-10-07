"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { CodeChip } from "@/components/ui/Badge";
import { MIN_REASON_LENGTH } from "@/lib/scrap-rules";

interface ScrapInfo {
  state: {
    scrapped: boolean;
    requestPending: boolean;
    requestedByName: string | null;
    requestReason: string | null;
  };
  summary: string;
  canPurge: boolean;
  purgeBlockers: string[];
  youCan: { scrap: boolean; request: boolean; restore: boolean; purge: boolean };
}

export default function ScrapProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: projectId } = use(params);

  const [projectCode, setProjectCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [info, setInfo] = useState<ScrapInfo | null>(null);
  const [reason, setReason] = useState("");
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

        // Fetch scrap info
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

  const asks = info?.youCan.request && !info?.youCan.scrap;
  const tooShort = reason.trim().length > 0 && reason.trim().length < MIN_REASON_LENGTH;
  const ready = reason.trim().length >= MIN_REASON_LENGTH;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/scrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not scrap this project.");
        return;
      }
      
      if (data.outcome === "scrapped") {
        router.push("/pmt");
        router.refresh();
      } else {
        router.push(`/pmt/${projectCode || projectId}`);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-xl shadow-sm border border-navy-500/10 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-navy-900 mb-2">
          {asks ? "Request that this project is scrapped" : "Scrap this project"}
        </h1>
        <p className="text-sm text-navy-500 mb-6">
          {asks
            ? "An administrator will action it. Your reason goes with the request."
            : "It leaves every list and stops counting against anybody's time. Nothing is deleted."}
        </p>

        <div className="space-y-6">
          <div className="flex items-center gap-2.5 rounded-lg border border-navy-900/8 bg-surface-2 px-3.5 py-2.5">
            <CodeChip>{projectCode || "..."}</CodeChip>
            <span className="min-w-0 truncate text-[13.5px] font-semibold text-navy-900">
              {projectName || "Loading..."}
            </span>
          </div>

          <div className="rounded-lg border border-navy-900/10 bg-surface-2 px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-400">
              What is kept
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-navy-700">
              {info ? info.summary : "Checking…"}
            </p>
            <p className="mt-2 text-[12px] leading-snug text-navy-400">
              All of it stays exactly where it is. Scrapping takes the project
              out of the lists and stops it counting against anybody&apos;s
              allocation — it does not delete anything.
            </p>
          </div>

          {info?.state.requestPending && (
            <div className="rounded-lg border border-warning/25 bg-warning-bg px-4 py-3 text-[13px] text-warning">
              <span className="font-semibold">{info.state.requestedByName}</span> has
              already asked for this — &ldquo;{info.state.requestReason}&rdquo;
            </div>
          )}

          <Textarea
            label="Why is it being scrapped?"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Client pulled the budget before kick-off. Nothing was delivered."
            error={tooShort ? `At least ${MIN_REASON_LENGTH} characters.` : undefined}
            hint={
              tooShort
                ? undefined
                : "Whoever reads this in six months will only have this sentence to go on."
            }
            rows={4}
          />

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
            onClick={submit}
            loading={busy}
            disabled={!ready || !info}
          >
            {asks ? "Send the request" : "Scrap project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
