import React from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  /** Lifts on hover. Only for cards that are themselves clickable. */
  interactive?: boolean;
  /** A coloured hairline down the left edge — status, health, phase. */
  accent?: string;
}

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const headerPadding = {
  none: "px-5 pt-5",
  sm: "",
  md: "",
  lg: "",
};

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  padding = "md",
  interactive = false,
  accent,
}: CardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-surface",
        // A hairline rather than a border colour: at 8% navy it reads as
        // an edge, not as a drawn box around everything.
        "border border-navy-900/8 shadow-xs",
        "transition-[box-shadow,border-color,transform] duration-300 ease-[var(--ease-out-soft)]",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-navy-900/14",
        paddingStyles[padding],
        className
      )}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: accent }}
        />
      )}
      {(title || actions) && (
        <div
          className={cn(
            "flex items-start justify-between gap-4",
            headerPadding[padding],
            children ? "mb-4" : ""
          )}
        >
          <div className="min-w-0">
            {title && (
              <h3 className="text-display text-[15px] font-bold leading-tight tracking-[-0.01em] text-navy-900">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1 text-[13px] leading-snug text-navy-500">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * A single number, given room.
 *
 * The number is the point, so it is set large in the display face with
 * tabular figures; everything else on the card is deliberately quiet.
 */
export function StatCard({
  label,
  value,
  icon,
  trend,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: string; positive: boolean };
  /** A line under the number — "of ₹42L budget", "3 overdue". */
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "warning" | "critical";
  className?: string;
}) {
  const toneRing = {
    default: "text-navy-700 bg-navy-900/6",
    positive: "text-success bg-success-bg",
    warning: "text-warning bg-warning-bg",
    critical: "text-danger bg-danger-bg",
  }[tone];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl bg-surface p-5",
        "border border-navy-900/8 shadow-xs",
        "transition-[box-shadow,border-color] duration-300 ease-[var(--ease-out-soft)]",
        "hover:shadow-sm hover:border-navy-900/14",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-400">
            {label}
          </p>
          <p
            data-numeric
            className="text-display mt-2 text-[28px] font-bold leading-none tracking-[-0.02em] text-navy-900"
          >
            {value}
          </p>
          {(hint || trend) && (
            <div className="mt-2 flex items-baseline gap-2 text-xs">
              {trend && (
                <span
                  className={cn(
                    "font-semibold",
                    trend.positive ? "text-success" : "text-danger"
                  )}
                >
                  {trend.positive ? "▲" : "▼"} {trend.value}
                </span>
              )}
              {hint && <span className="text-navy-400">{hint}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn("grid h-9 w-9 place-items-center rounded-lg", toneRing)}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/** A heading that introduces a block of a page, with the chevron mark. */
export function SectionHeading({
  children,
  actions,
  description,
  className,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-display flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.015em] text-navy-900">
          <span aria-hidden className="h-4 w-[3px] rounded-full bg-red-600" />
          {children}
        </h2>
        {description && (
          <p className="mt-1 pl-[22px] text-[13px] text-navy-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Nothing here yet — say so properly rather than leaving a blank box. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl px-6 py-12 text-center",
        "border border-dashed border-navy-900/14 bg-surface-2",
        className
      )}
    >
      {icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-navy-900/6 text-navy-400">
          {icon}
        </div>
      )}
      <p className="text-display text-[15px] font-bold text-navy-800">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-navy-500">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
