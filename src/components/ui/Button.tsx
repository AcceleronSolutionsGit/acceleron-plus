import React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost" | "subtle";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. Use for anything that posts. */
  loading?: boolean;
  /** Fills its container. Clearer than passing `w-full` through className. */
  block?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  // A very shallow gradient rather than a flat fill: it catches the light
  // the way a physical key does, and is the difference between a button
  // that looks drawn and one that looks placed.
  primary: cn(
    "text-white shadow-sm",
    "bg-[linear-gradient(180deg,var(--color-navy-700),var(--color-navy-900))]",
    "hover:bg-[linear-gradient(180deg,var(--color-navy-600),var(--color-navy-800))]",
    "hover:shadow-md active:shadow-xs"
  ),
  secondary: cn(
    "bg-surface text-navy-900 shadow-xs",
    "border border-navy-900/12",
    "hover:border-navy-900/25 hover:bg-surface-2 active:bg-surface-3"
  ),
  destructive: cn(
    "text-white shadow-sm",
    "bg-[linear-gradient(180deg,#d1452f,var(--color-danger))]",
    "hover:brightness-95 hover:shadow-md active:shadow-xs"
  ),
  subtle: "bg-navy-900/6 text-navy-800 hover:bg-navy-900/11 active:bg-navy-900/14",
  ghost: "text-navy-600 hover:text-navy-900 hover:bg-navy-900/6 active:bg-navy-900/10",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-6 text-[15px] gap-2 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center font-medium cursor-pointer select-none",
        "transition-[background,box-shadow,transform,border-color,color] duration-200 ease-[var(--ease-out-soft)]",
        // 1px of travel. Enough to feel, not enough to notice.
        "active:translate-y-px",
        "disabled:opacity-45 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:shadow-none",
        block && "w-full",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center"
        >
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      )}
      {/* The label stays in the flow while loading so the button does not
          change width mid-click and move whatever is next to it. */}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>
        {children}
      </span>
    </button>
  );
}

/** A square button for a single icon. Needs an aria-label. */
export function IconButton({
  size = "md",
  className,
  children,
  ...props
}: Omit<ButtonProps, "block"> & { "aria-label": string }) {
  return (
    <Button
      size={size}
      className={cn(
        "px-0 shrink-0",
        size === "xs" && "w-7",
        size === "sm" && "w-8",
        size === "md" && "w-9",
        size === "lg" && "w-11",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
