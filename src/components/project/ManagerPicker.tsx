"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PmCandidate } from "@/lib/types";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DropdownPanel } from "@/components/ui/DropdownPanel";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// Picking a project's managers.
//
// Several PMs per project; the first is the lead. The list of people is
// fetched once per page load and shared by every picker on the page, and
// it is fetched ahead of time (on idle) so opening a picker is instant.
// Searching narrows a precomputed lower-case index and only the first
// few dozen matches are drawn, so a master of thousands stays smooth.
// ═══════════════════════════════════════════════════════════════

/** A chosen manager — what a picker holds and hands back. */
export interface PickedManager {
  key: string;
  fullName: string;
  jobLevel: string | null;
  employeeId: string | null;
  userId: string | null;
}

const SHOWN = 40;

// ─── The shared people list ─────────────────────────────────────

let peopleCache: PmCandidate[] | null = null;
let peoplePromise: Promise<PmCandidate[]> | null = null;

function fetchPeople(): Promise<PmCandidate[]> {
  if (peopleCache) return Promise.resolve(peopleCache);
  if (!peoplePromise) {
    peoplePromise = fetch("/api/pmt/people")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.error ?? "Could not load people.");
        peopleCache = data.people as PmCandidate[];
        return peopleCache;
      })
      .catch((err) => {
        peoplePromise = null; // let the next open try again
        throw err;
      });
  }
  return peoplePromise;
}

/** Warm the list in the background so the first picker opens instantly. */
export function prefetchPeople() {
  if (peopleCache || peoplePromise) return;
  const run = () => void fetchPeople().catch(() => undefined);
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 400);
}

function usePeople() {
  const [people, setPeople] = useState<PmCandidate[] | null>(peopleCache);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchPeople()
      .then(setPeople)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!people) load();
  }, [people, load]);

  return { people, error, retry: load };
}

// ─── Search ─────────────────────────────────────────────────────

interface Indexed {
  person: PmCandidate;
  name: string;
  haystack: string;
}

function rank(entry: Indexed, q: string): number {
  if (entry.name.startsWith(q)) return 0;
  if (entry.name.includes(` ${q}`)) return 1;
  if (entry.name.includes(q)) return 2;
  return 3;
}

function subtitleFor(p: { jobLevel?: string | null; designation?: string | null; department?: string | null }) {
  return [p.designation, p.jobLevel, p.department].filter(Boolean).join(" · ");
}

export function toPicked(p: PmCandidate): PickedManager {
  return {
    key: p.key,
    fullName: p.fullName,
    jobLevel: p.jobLevel,
    employeeId: p.employeeId,
    userId: p.userId,
  };
}

// ─── The panel ──────────────────────────────────────────────────

export function ManagerPickerPanel({
  value,
  onChange,
  onClose,
  footer,
}: {
  value: PickedManager[];
  onChange: (next: PickedManager[]) => void;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const { people, error, retry } = usePeople();
  const [query, setQuery] = useState("");
  // Not deferred: Enter must act on exactly what is on screen for what
  // was typed. Filtering a few thousand pre-lowered strings is cheap.
  const deferredQuery = query;
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const index = useMemo<Indexed[]>(
    () =>
      (people ?? []).map((person) => ({
        person,
        name: person.fullName.toLowerCase(),
        haystack: [
          person.fullName,
          person.email,
          person.employeeId,
          person.designation,
          person.jobLevel,
          person.department,
          person.location,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [people]
  );

  const selectedKeys = useMemo(() => new Set(value.map((v) => v.key)), [value]);

  const { matches, total } = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) {
      // Nothing typed: the chosen people are already listed above, so
      // show everyone else alphabetically.
      const rest = index.filter((e) => !selectedKeys.has(e.person.key));
      return { matches: rest.slice(0, SHOWN), total: rest.length };
    }
    const terms = q.split(/\s+/);
    const found = index.filter((e) => terms.every((t) => e.haystack.includes(t)));
    found.sort((a, b) => rank(a, q) - rank(b, q) || a.name.localeCompare(b.name));
    return { matches: found.slice(0, SHOWN), total: found.length };
  }, [index, deferredQuery, selectedKeys]);

  useEffect(() => setCursor(0), [deferredQuery]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const toggle = (person: PmCandidate) => {
    if (selectedKeys.has(person.key)) {
      onChange(value.filter((v) => v.key !== person.key));
    } else {
      onChange([...value, toPicked(person)]);
    }
  };

  const remove = (key: string) => onChange(value.filter((v) => v.key !== key));
  const makeLead = (key: string) => {
    const chosen = value.find((v) => v.key === key);
    if (!chosen) return;
    onChange([chosen, ...value.filter((v) => v.key !== key)]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, matches.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (matches[cursor]) {
          toggle(matches[cursor].person);
          setQuery("");
        }
        break;
      case "Backspace":
        if (!query && value.length > 0) remove(value[value.length - 1].key);
        break;
      case "Escape":
        // Close only the picker — not a dialog it may be sitting in.
        e.preventDefault();
        e.nativeEvent.stopImmediatePropagation();
        onClose();
        break;
    }
  };

  return (
    <div className="flex max-h-[min(520px,calc(100vh-120px))] flex-col">
      {/* Search */}
      <div className="border-b border-navy-900/8 p-2.5">
        <div className="relative">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-300"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search name, email, grade, department…"
            aria-label="Search people"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "h-9 w-full rounded-lg border border-navy-900/12 bg-surface-2 pl-8 pr-3 text-[13px]",
              "text-navy-900 placeholder:text-navy-300",
              "transition-[border-color,background] duration-150",
              "focus:border-navy-700 focus:bg-surface focus:outline-none"
            )}
          />
        </div>
      </div>

      {/* Chosen */}
      {value.length > 0 && (
        <div className="border-b border-navy-900/8 bg-surface-2/60 px-2 py-2">
          <p className="px-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-navy-400">
            Project managers · {value.length}
          </p>
          <ul className="space-y-0.5">
            {value.map((m, i) => (
              <li
                key={m.key}
                className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface"
              >
                <Avatar name={m.fullName} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-navy-900">
                    {m.fullName}
                  </span>
                </span>
                {i === 0 ? (
                  <span className="shrink-0 rounded-md bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white">
                    Lead
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeLead(m.key)}
                    className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-navy-400 opacity-0 transition-[opacity,color,background] duration-150 hover:bg-navy-900/6 hover:text-navy-800 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    Make lead
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(m.key)}
                  aria-label={`Remove ${m.fullName}`}
                  className="shrink-0 cursor-pointer rounded-md p-1 text-navy-300 transition-colors hover:bg-danger-bg hover:text-danger"
                >
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-medium text-danger">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-2 cursor-pointer text-[12.5px] font-semibold text-navy-700 underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : !people ? (
          <ul className="space-y-1 p-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                <span className="shimmer h-6 w-6 rounded-full" />
                <span className="flex-1 space-y-1.5">
                  <span className="shimmer block h-2.5 w-2/5 rounded" />
                  <span className="shimmer block h-2 w-3/5 rounded" />
                </span>
              </li>
            ))}
          </ul>
        ) : matches.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-navy-400">
            {query ? <>Nobody matches &ldquo;{query}&rdquo;</> : "Everyone is already chosen."}
          </p>
        ) : (
          <ul ref={listRef} role="listbox" aria-multiselectable className="p-1.5">
            {matches.map((entry, i) => {
              const p = entry.person;
              const chosen = selectedKeys.has(p.key);
              const detail = subtitleFor(p);
              return (
                <li key={p.key} data-index={i}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    onMouseMove={() => cursor !== i && setCursor(i)}
                    onClick={() => toggle(p)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                      "transition-colors duration-100",
                      i === cursor ? "bg-navy-900/6" : "bg-transparent"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors duration-150",
                        chosen ? "border-navy-900 bg-navy-900 text-white" : "border-navy-900/20 bg-surface"
                      )}
                    >
                      {chosen && (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m2.5 6.2 2.3 2.3L9.5 3.8" />
                        </svg>
                      )}
                    </span>
                    <Avatar name={p.fullName} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-navy-900">
                        {p.fullName}
                      </span>
                      {(detail || p.email) && (
                        <span className="block truncate text-[11.5px] text-navy-400">
                          {detail || p.email}
                        </span>
                      )}
                    </span>
                    {!p.employeeId && (
                      <span className="shrink-0 rounded bg-navy-900/6 px-1.5 py-0.5 text-[10px] font-semibold text-navy-500">
                        Account
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {total > matches.length && (
              <li className="px-2.5 py-2 text-[11.5px] text-navy-300">
                Showing {matches.length} of {total} — keep typing to narrow it down.
              </li>
            )}
          </ul>
        )}
      </div>

      {footer && (
        <div className="flex items-center justify-between gap-2 border-t border-navy-900/8 bg-surface-2 px-3 py-2.5">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── A form field ───────────────────────────────────────────────

/** For forms: a trigger showing who is chosen, opening the panel. */
export function ManagerField({
  value,
  onChange,
  label = "Project managers",
  hint,
}: {
  value: PickedManager[];
  onChange: (next: PickedManager[]) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => prefetchPeople(), []);

  return (
    <div className="space-y-1.5">
      <span className="block text-[13px] font-semibold text-navy-700">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border bg-surface px-3 py-1.5 text-left text-sm shadow-xs",
          "transition-[border-color,box-shadow] duration-200",
          open
            ? "border-navy-700 shadow-[0_0_0_3px_rgb(33_47_96_/_0.12)]"
            : "border-navy-900/14 hover:border-navy-900/25"
        )}
      >
        {value.length === 0 ? (
          <span className="flex-1 text-navy-300">Choose one or more PMs…</span>
        ) : (
          <>
            <AvatarStack names={value.map((v) => v.fullName)} size="xs" max={4} />
            <span className="min-w-0 flex-1 truncate text-navy-900">
              <span className="font-medium">{value[0].fullName}</span>
              {value.length > 1 && (
                <span className="text-navy-400"> +{value.length - 1} more</span>
              )}
            </span>
          </>
        )}
        <svg aria-hidden viewBox="0 0 12 12" className={cn("h-3 w-3 shrink-0 text-navy-400 transition-transform duration-200", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {hint && <p className="text-xs leading-snug text-navy-400">{hint}</p>}

      <DropdownPanel
        anchorRef={triggerRef}
        open={open}
        onClose={close}
        align="left"
        width={Math.min(420, triggerRef.current?.offsetWidth ?? 380)}
        estimatedHeight={420}
        role="dialog"
        label="Choose project managers"
      >
        <ManagerPickerPanel
          value={value}
          onChange={onChange}
          onClose={close}
          footer={
            <>
              <span className="text-[11.5px] text-navy-400">The first person is the lead PM.</span>
              <Button size="sm" onClick={close}>
                Done
              </Button>
            </>
          }
        />
      </DropdownPanel>
    </div>
  );
}
