import React from "react";
import { Logo } from "@/components/ui/Logo";

/**
 * The sign-in screen is the only page in this app anyone sees before
 * they have permission to see anything, so it is the only place the
 * brand gets room. Two panels: identity on the left, the form on the
 * right. Below `lg` the left panel folds away to a single logo — on a
 * phone the job is to sign in, not to be impressed.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      {/* ─── Brand ──────────────────────────────────────────────── */}
      <div className="relative hidden w-[46%] max-w-[640px] shrink-0 overflow-hidden bg-[linear-gradient(160deg,#2a3a72_0%,#212f60_50%,#18214a_100%)] lg:flex lg:flex-col">
        {/* The chevron repeated as a fine engraved pattern. Drawn as a
            tiled SVG at 3% white, it reads as a surface — like a watermark
            on good paper — rather than as a picture of a mountain, which
            is what one enormous chevron turns into. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cpath d='M12 44 L36 20 L60 44' fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-width='3'/%3E%3Cpath d='M12 62 L36 38 L60 62' fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-width='3'/%3E%3C/svg%3E\")",
            backgroundSize: "72px 72px",
            // Fades out before it reaches the text, so the pattern never
            // competes with anything anyone has to read.
            maskImage:
              "radial-gradient(120% 90% at 85% 15%, #000 0%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(120% 90% at 85% 15%, #000 0%, transparent 72%)",
          }}
        />

        {/* A single soft red bloom, low and off to one side. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-32 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgb(222_30_36_/_0.09),transparent_62%)]"
        />

        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-14">
          <Logo variant="wordmark" tone="light" className="reveal h-8 w-auto" />

          <div className="max-w-md">
            <p className="reveal reveal-2 text-display text-[38px] font-bold leading-[1.1] tracking-[-0.025em] text-white xl:text-[44px]">
              Every project,
              <br />
              every hour,
              <br />
              <span className="text-white/45">one place.</span>
            </p>
            <p className="reveal reveal-3 mt-5 max-w-sm text-[14.5px] leading-relaxed text-white/55">
              Delivery, service desk, staffing and margin — the whole
              engagement, from the first conversation to the final invoice.
            </p>
          </div>

          <div className="reveal reveal-4 flex items-center gap-3 text-[11.5px] text-white/35">
            <span aria-hidden className="h-px w-8 bg-white/25" />
            <span>© {new Date().getFullYear()} Acceleron Solutions</span>
          </div>
        </div>
      </div>

      {/* ─── Form ───────────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-5 sm:p-8">
        {children}
      </div>
    </div>
  );
}
