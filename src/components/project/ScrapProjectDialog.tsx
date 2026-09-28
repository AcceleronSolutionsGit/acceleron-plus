"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { CodeChip } from "@/components/ui/Badge";
import { MIN_REASON_LENGTH } from "@/lib/scrap-rules";
import { cn } from "@/lib/utils";

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

/**
 * Scrapping a project, with the reason it needs.
 *
 * The dialog says what will happen to the records *before* it asks for
 * the reason. Somebody about to remove a project needs to know whether
 * forty approved timesheets are going with it, and finding that out
 * afterwards is not a useful time to learn it.
 */
export function ScrapProjectDialog({
  projectId,
  projectCode,
  projectName,
  isOpen,
  onClose,
  onDone,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onDone?: (outcome: string, message: string) => void;
}) {
  const [info, setInfo] = useState<ScrapInfo | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setReason("");
    setError("");
    setInfo(null);

    (async () => {
      try {
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
  }, [isOpen, projectId]);

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
      onDone?.(data.outcome, data.message);
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={asks ? "Request that this project is scrapped" : "Scrap this project"}
      description={
        asks
          ? "An administrator will action it. Your reason goes with the request."
          : "It leaves every list and stops counting against anybody's time. Nothing is deleted."
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={submit}
            loading={busy}
            disabled={!ready || !info}
          >
            {asks ? "Send the request" : "Scrap project"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-lg border border-navy-900/8 bg-surface-2 px-3.5 py-2.5">
          <CodeChip>{projectCode}</CodeChip>
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-navy-900">
            {projectName}
          </span>
        </div>

        {/* What happens to everything hanging off it, stated up front. */}
        <div className="rounded-lg border border-navy-900/10 bg-surface-2 px-3.5 py-3">
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
          <div className="rounded-lg border border-warning/25 bg-warning-bg px-3.5 py-2.5 text-[12.5px] text-warning">
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
          rows={3}
        />

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/20 bg-danger-bg px-3.5 py-2.5 text-[12.5px] text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Deleting for good.
 *
 * A second dialog rather than a second button on the first, because
 * this is the one that cannot be undone — and it is only ever reachable
 * on a project that has already been scrapped and holds nothing.
 */
export function PurgeProjectDialog({
  projectId,
  projectCode,
  projectName,
  blockers,
  isOpen,
  onClose,
  onDone,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  blockers: string[];
  isOpen: boolean;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTyped("");
      setError("");
    }
  }, [isOpen]);

  const blocked = blockers.length > 0;
  // Typing the code is the friction. It is the difference between
  // "I clicked the red button" and "I meant this project".
  const confirmed = typed.trim().toUpperCase() === projectCode.toUpperCase();

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
      onDone?.(data.message);
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete permanently"
      description="This cannot be undone."
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={purge}
            loading={busy}
            disabled={blocked || !confirmed}
          >
            Delete {projectCode} for good
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-lg border border-navy-900/8 bg-surface-2 px-3.5 py-2.5">
          <CodeChip>{projectCode}</CodeChip>
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-navy-900">
            {projectName}
          </span>
        </div>

        {blocked ? (
          <div className="rounded-lg border border-danger/20 bg-danger-bg px-3.5 py-3">
            <p className="text-[13px] font-semibold text-danger">
              This one cannot be deleted permanently.
            </p>
            <ul className="mt-2 space-y-1">
              {blockers.map((b) => (
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
            <div className="rounded-lg border border-danger/20 bg-danger-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-danger">
              Nothing is attached to this project, so there is nothing to lose —
              but the row and its plan go for good and there is no restoring it.
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-navy-700">
                Type <span className="font-mono text-navy-900">{projectCode}</span> to
                confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "font-mono h-9 w-full rounded-lg border bg-surface px-3 text-sm tracking-wide text-navy-900",
                  "transition-[border-color,box-shadow] duration-200",
                  "focus:outline-none focus:shadow-[0_0_0_3px_rgb(192_57_43_/_0.14)]",
                  confirmed
                    ? "border-success focus:border-success"
                    : "border-navy-900/14 focus:border-danger"
                )}
              />
            </label>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/20 bg-danger-bg px-3.5 py-2.5 text-[12.5px] text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
