"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { guideById, type Guide, type GuideStep } from "@/lib/guides";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// The guided tour.
//
// It points rather than blocks: the overlay never takes pointer
// events, so the thing being highlighted is still clickable and you
// can follow the instruction while the card is up. A tour that
// disables the app while explaining it teaches nothing.
//
// A tour survives navigating between pages — the position is kept in
// sessionStorage, so a step that says "open the Team tab" can be
// followed by one that lives on a different route.
// ═══════════════════════════════════════════════════════════════

const ACTIVE_KEY = "acceleron.guide.active";
const DONE_KEY = "acceleron.guides.done";
const SEEN_KEY = "acceleron.guide.seen";

const CARD_WIDTH = 372;
const CARD_MAX_HEIGHT = 260;
const GAP = 14;

interface GuideContextValue {
  start: (guideId: string) => void;
  stop: () => void;
  activeGuideId: string | null;
  completed: string[];
  /** True until the person has opened the Guide panel even once. */
  isNew: boolean;
  markSeen: () => void;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide must be used inside <GuideProvider>");
  return ctx;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing — the tour still works, it just won't be remembered */
  }
}

function selectorFor(target: string): string {
  return target.startsWith("css:")
    ? target.slice(4)
    : `[data-guide="${CSS.escape ? CSS.escape(target) : target}"]`;
}

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [isNew, setIsNew] = useState(false);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);

  // Restore a tour that was mid-flight when the page changed.
  useEffect(() => {
    setCompleted(readJson<string[]>(DONE_KEY, []));
    try {
      setIsNew(!window.localStorage.getItem(SEEN_KEY));
      const raw = window.sessionStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { id: string; step: number };
        const found = guideById(saved.id);
        if (found) {
          setGuide(found);
          setIndex(Math.min(saved.step, found.steps.length - 1));
        }
      }
    } catch {
      /* nothing to restore */
    }
  }, []);

  const persist = useCallback((id: string | null, step: number) => {
    try {
      if (id) {
        window.sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, step }));
      } else {
        window.sessionStorage.removeItem(ACTIVE_KEY);
      }
    } catch {
      /* the tour still runs, it just won't survive a reload */
    }
  }, []);

  const step: GuideStep | null = guide ? guide.steps[index] ?? null : null;

  const stop = useCallback(() => {
    setGuide(null);
    setIndex(0);
    setRect(null);
    setMissing(false);
    persist(null, 0);
  }, [persist]);

  const finish = useCallback(() => {
    if (guide) {
      setCompleted((prev) => {
        const next = prev.includes(guide.id) ? prev : [...prev, guide.id];
        writeJson(DONE_KEY, next);
        return next;
      });
    }
    stop();
  }, [guide, stop]);

  const goTo = useCallback(
    (next: number) => {
      if (!guide) return;
      if (next < 0) return;
      if (next >= guide.steps.length) {
        finish();
        return;
      }
      setIndex(next);
      setRect(null);
      setMissing(false);
      persist(guide.id, next);
    },
    [guide, finish, persist]
  );

  const start = useCallback(
    (guideId: string) => {
      const found = guideById(guideId);
      if (!found) return;
      setGuide(found);
      setIndex(0);
      setRect(null);
      setMissing(false);
      persist(found.id, 0);
      const first = found.steps[0];
      const target = first?.path ?? found.path;
      if (target && target !== pathname) router.push(target);
    },
    [pathname, router, persist]
  );

  const markSeen = useCallback(() => {
    setIsNew(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* fine */
    }
  }, []);

  // ── Take the tour to the page the step lives on ───────────────
  useEffect(() => {
    if (!step?.path) return;
    if (pathname === step.path || pathname.startsWith(step.path + "/")) return;
    router.push(step.path);
  }, [step, pathname, router]);

  // ── Find and follow the element ───────────────────────────────
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!step) return;
    if (!step.target) {
      setRect(null);
      setMissing(false);
      return;
    }

    let cancelled = false;
    const selector = selectorFor(step.target);
    const deadline = Date.now() + 4000;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(selector);

      if (!el) {
        // The page may still be loading, or rendering the row this step
        // points at. Keep looking for a few seconds before admitting it.
        if (Date.now() < deadline) {
          rafRef.current = requestAnimationFrame(measure);
        } else {
          setMissing(true);
          setRect(null);
        }
        return;
      }

      setMissing(false);
      const box = el.getBoundingClientRect();
      setRect((prev) =>
        prev &&
        Math.abs(prev.top - box.top) < 0.5 &&
        Math.abs(prev.left - box.left) < 0.5 &&
        Math.abs(prev.width - box.width) < 0.5 &&
        Math.abs(prev.height - box.height) < 0.5
          ? prev
          : box
      );
      // Keep following it — the page can scroll, a tab can resize it,
      // an animation can still be settling.
      rafRef.current = requestAnimationFrame(measure);
    };

    // Bring it into view once, then track.
    const el = document.querySelector<HTMLElement>(selector);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    rafRef.current = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step, pathname]);

  // ── Doing the thing moves the tour on ─────────────────────────
  useEffect(() => {
    if (!step?.target || !step.advanceOnAction) return;
    const el = document.querySelector<HTMLElement>(selectorFor(step.target));
    if (!el) return;
    const onClick = () => goTo(index + 1);
    el.addEventListener("click", onClick, { once: true });
    return () => el.removeEventListener("click", onClick);
  }, [step, index, goTo, rect]);

  // ── Keyboard ──────────────────────────────────────────────────
  useEffect(() => {
    if (!guide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(index - 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [guide, index, goTo, stop]);

  const value = useMemo<GuideContextValue>(
    () => ({ start, stop, activeGuideId: guide?.id ?? null, completed, isNew, markSeen }),
    [start, stop, guide, completed, isNew, markSeen]
  );

  return (
    <GuideContext.Provider value={value}>
      {children}
      {guide && step && (
        <Spotlight
          guide={guide}
          step={step}
          index={index}
          rect={rect}
          missing={missing}
          onNext={() => goTo(index + 1)}
          onBack={() => goTo(index - 1)}
          onClose={stop}
        />
      )}
    </GuideContext.Provider>
  );
}

// ─── The overlay ───────────────────────────────────────────────────

function Spotlight({
  guide,
  step,
  index,
  rect,
  missing,
  onNext,
  onBack,
  onClose,
}: {
  guide: Guide;
  step: GuideStep;
  index: number;
  rect: DOMRect | null;
  missing: boolean;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const last = index === guide.steps.length - 1;
  const anchored = Boolean(rect) && !missing;

  // Where the card goes. Below the target if it fits, above if not,
  // beside it if neither, and clamped so it never leaves the viewport.
  const position = (() => {
    if (!rect) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top: number;
    let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;

    if (rect.bottom + CARD_MAX_HEIGHT + GAP < vh) {
      top = rect.bottom + GAP;
    } else if (rect.top - CARD_MAX_HEIGHT - GAP > 0) {
      top = rect.top - CARD_MAX_HEIGHT - GAP;
    } else if (rect.right + CARD_WIDTH + GAP < vw) {
      top = Math.max(GAP, rect.top);
      left = rect.right + GAP;
    } else {
      top = Math.max(GAP, rect.top);
      left = rect.left - CARD_WIDTH - GAP;
    }

    return {
      top: Math.min(Math.max(GAP, top), vh - CARD_MAX_HEIGHT - GAP),
      left: Math.min(Math.max(GAP, left), vw - CARD_WIDTH - GAP),
    };
  })();

  return (
    <>
      {/* The dim. `pointer-events-none` is the important part: the
          highlighted control stays clickable, so an instruction that
          says "click here" can actually be followed. */}
      {anchored && rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[90] rounded-lg transition-all duration-300 ease-[var(--ease-out-soft)]"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgb(20 28 58 / 0.55)",
            outline: "2px solid var(--color-red-600)",
            outlineOffset: "0px",
          }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[90] bg-[rgb(20_28_58_/_0.55)]"
        />
      )}

      {/* A click anywhere outside the card leaves the tour. Sits under
          the card but over the page, and deliberately does not cover
          the spotlight hole. */}
      <button
        aria-label="Close the guide"
        onClick={onClose}
        className="fixed inset-0 z-[91] cursor-default"
        style={{ background: "transparent" }}
        tabIndex={-1}
      />

      <div
        role="dialog"
        aria-live="polite"
        aria-label={`${guide.title} — step ${index + 1} of ${guide.steps.length}`}
        className={cn(
          "fixed z-[92] overflow-hidden rounded-2xl border border-white/60 bg-surface shadow-xl",
          "animate-[modal-in_260ms_var(--ease-out-soft)_both]"
        )}
        style={
          position
            ? { top: position.top, left: position.left, width: CARD_WIDTH }
            : {
                top: "50%",
                left: "50%",
                width: CARD_WIDTH,
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-navy-900/8 bg-surface-2 px-4 py-2.5">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-navy-400">
            <span aria-hidden className="h-3 w-[3px] rounded-full bg-red-600" />
            {guide.title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close the guide"
            className="-mr-1 cursor-pointer rounded-md p-1 text-navy-400 transition-colors hover:bg-navy-900/6 hover:text-navy-900"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3.5">
          <h3 className="text-display text-[15.5px] font-bold leading-snug tracking-[-0.01em] text-navy-900">
            {step.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-navy-600">{step.body}</p>

          {step.action && anchored && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-100/70 px-3 py-2 text-[12.5px] font-semibold text-red-700">
              <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h8M8.5 4.5 12 8l-3.5 3.5" />
              </svg>
              {step.action}
            </p>
          )}

          {missing && (
            <p className="mt-3 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
              That control is not on this screen right now — it may need
              something selected first. Carry on, or close the guide and come
              back to it.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-navy-900/8 bg-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-1" aria-hidden>
            {guide.steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-4 bg-red-600" : i < index ? "w-1.5 bg-navy-300" : "w-1.5 bg-navy-900/12"
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <button
                onClick={onBack}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-navy-500 transition-colors hover:bg-navy-900/6 hover:text-navy-900"
              >
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm",
                "bg-[linear-gradient(180deg,var(--color-navy-700),var(--color-navy-900))]",
                "transition-[background,box-shadow] duration-200 hover:shadow-md"
              )}
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
