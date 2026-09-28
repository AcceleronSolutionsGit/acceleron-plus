import React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "info"
  | "urgent"
  | "critical"
  | "success"
  | "warning"
  | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  size?: "sm" | "md";
  /**
   * Solid fill instead of a tint.
   *
   * Tinted is the default because these appear a dozen to a table row,
   * and a dozen saturated chips makes every row look like an alert —
   * at which point none of them reads as one. Reserve solid for the
   * handful of places where the badge *is* the alarm.
   */
  solid?: boolean;
  /** A small filled circle before the label. Good for status. */
  dot?: boolean;
}

/** [tinted background, tinted text, solid background] */
const tones: Record<BadgeVariant, [string, string, string]> = {
  info: ["bg-info-bg", "text-info", "bg-info text-white"],
  urgent: ["bg-red-100", "text-red-700", "bg-red-600 text-white"],
  critical: ["bg-danger-bg", "text-danger", "bg-danger text-white"],
  success: ["bg-success-bg", "text-success", "bg-success text-white"],
  warning: ["bg-warning-bg", "text-warning", "bg-warning text-white"],
  neutral: ["bg-navy-900/7", "text-navy-600", "bg-navy-700 text-white"],
};

const sizeStyles = {
  sm: "h-[19px] px-1.5 text-[10.5px] gap-1",
  md: "h-[22px] px-2 text-[11.5px] gap-1.5",
};

export function Badge({
  children,
  variant = "info",
  className,
  size = "md",
  solid = false,
  dot = false,
}: BadgeProps) {
  const [tintBg, tintText, solidStyle] = tones[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md font-semibold",
        "tracking-[0.01em]",
        solid ? solidStyle : cn(tintBg, tintText),
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            solid ? "bg-current opacity-80" : "bg-current"
          )}
        />
      )}
      {children}
    </span>
  );
}

/** Pass your own colour classes — used where colour is data-driven. */
export function ColorBadge({
  children,
  colorClass,
  className,
}: {
  children: React.ReactNode;
  colorClass: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-[11.5px] font-semibold",
        colorClass,
        className
      )}
    >
      {children}
    </span>
  );
}

/** A monospaced reference — PRJ-0001, WBS-003, INC-1042. */
export function CodeChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono inline-flex items-center rounded-[5px] bg-navy-900/6 px-1.5 py-0.5",
        "text-[11.5px] font-medium tracking-tight text-navy-600",
        className
      )}
    >
      {children}
    </span>
  );
}
