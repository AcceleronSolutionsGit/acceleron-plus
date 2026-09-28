import React from "react";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number; // 0-100
  size?: "xs" | "sm" | "md";
  color?: "navy" | "success" | "warning" | "danger";
  showLabel?: boolean;
  className?: string;
  /**
   * Where the plan says it should be, as a tick on the track. A bar on
   * its own says "60% done"; a bar with a marker says "60% done and
   * eight points behind", which is the thing anyone actually wants.
   */
  target?: number;
  label?: string;
}

const colorStyles = {
  navy: "bg-[linear-gradient(90deg,var(--color-navy-600),var(--color-navy-800))]",
  success: "bg-[linear-gradient(90deg,#17a566,var(--color-success))]",
  warning: "bg-[linear-gradient(90deg,#d08511,var(--color-warning))]",
  danger: "bg-[linear-gradient(90deg,#d6503e,var(--color-danger))]",
};

const sizeStyles = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2.5",
};

export function ProgressBar({
  value,
  size = "sm",
  color = "navy",
  showLabel = false,
  className,
  target,
  label,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative flex-1 overflow-hidden rounded-full bg-navy-900/8",
          sizeStyles[size]
        )}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-soft)]",
            colorStyles[color]
          )}
          style={{ width: `${pct}%` }}
        />
        {target !== undefined && (
          <span
            aria-hidden
            title={`Plan: ${Math.round(target)}%`}
            className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full bg-navy-900/45"
            style={{ left: `${Math.max(0, Math.min(100, target))}%` }}
          />
        )}
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-navy-600">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/**
 * The same number as a ring. For a dashboard tile where the figure is
 * the subject rather than one column of many.
 */
export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  color = "navy",
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: "navy" | "success" | "warning" | "danger";
  className?: string;
  children?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = {
    navy: "var(--color-navy-700)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
    danger: "var(--color-danger)",
  }[color];

  return (
    <span
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-navy-900/8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: "stroke-dashoffset 700ms var(--ease-out-soft)" }}
        />
      </svg>
      <span className="absolute text-[13px] font-bold tabular-nums text-navy-800">
        {children ?? `${Math.round(pct)}%`}
      </span>
    </span>
  );
}
