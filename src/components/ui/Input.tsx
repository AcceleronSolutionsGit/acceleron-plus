import React from "react";
import { cn } from "@/lib/utils";

/**
 * One field shell for input, textarea and select, so the three never
 * drift apart. Every control in the app is the same height, has the
 * same focus treatment, and puts its error in the same place.
 */
const fieldBase = cn(
  "w-full rounded-lg bg-surface text-navy-900",
  "border border-navy-900/14 shadow-xs",
  "placeholder:text-navy-300",
  "transition-[border-color,box-shadow,background] duration-200 ease-[var(--ease-out-soft)]",
  "hover:border-navy-900/25",
  // The focus ring is drawn with a box-shadow rather than an outline so
  // it hugs the rounded corners instead of boxing them.
  "focus:outline-none focus:border-navy-700 focus:shadow-[0_0_0_3px_rgb(33_47_96_/_0.12)]",
  "disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-navy-400"
);

const fieldError = cn(
  "border-danger/60 hover:border-danger",
  "focus:border-danger focus:shadow-[0_0_0_3px_rgb(192_57_43_/_0.14)]"
);

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={id}
          className="flex items-baseline gap-1 text-[13px] font-semibold text-navy-700"
        >
          {label}
          {required && (
            <span className="text-red-600" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {/* Error replaces the hint rather than stacking under it: two lines
          of guidance under one field is one line too many. */}
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-xs font-medium text-danger">
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M6 0a6 6 0 100 12A6 6 0 006 0zm0 2.6a.7.7 0 01.7.75l-.2 2.9a.5.5 0 01-1 0l-.2-2.9A.7.7 0 016 2.6zm0 5.6a.8.8 0 110 1.6.8.8 0 010-1.6z" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-snug text-navy-400">{hint}</p>
      ) : null}
    </div>
  );
}

function autoId(label: unknown, id?: string) {
  if (id) return id;
  return typeof label === "string"
    ? label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : undefined;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  /** Rendered inside the field, on the left — a ₹, a magnifier, a unit. */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  fieldClassName?: string;
  /**
   * React 19 passes `ref` as an ordinary prop to function components,
   * but InputHTMLAttributes doesn't declare it — so state it here to
   * let callers focus the field (the sign-in code box, for one).
   */
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({
  label,
  hint,
  error,
  leading,
  trailing,
  className,
  fieldClassName,
  id,
  ref,
  required,
  ...props
}: InputProps) {
  const inputId = autoId(label, id);
  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
    >
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-navy-400">
            {leading}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(
            fieldBase,
            "h-9 px-3 text-sm",
            leading && "pl-8",
            trailing && "pr-9",
            error && fieldError,
            className
          )}
          {...props}
        />
        {trailing && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-navy-400">
            {trailing}
          </span>
        )}
      </div>
    </Field>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  fieldClassName?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  hint,
  error,
  className,
  fieldClassName,
  id,
  ref,
  required,
  ...props
}: TextareaProps) {
  const inputId = autoId(label, id);
  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
    >
      <textarea
        id={inputId}
        ref={ref}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(
          fieldBase,
          "min-h-[84px] resize-y px-3 py-2.5 text-sm leading-relaxed",
          error && fieldError,
          className
        )}
        {...props}
      />
    </Field>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  fieldClassName?: string;
  ref?: React.Ref<HTMLSelectElement>;
}

export function Select({
  label,
  hint,
  error,
  className,
  fieldClassName,
  id,
  ref,
  required,
  children,
  ...props
}: SelectProps) {
  const inputId = autoId(label, id);
  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
    >
      <div className="relative">
        <select
          id={inputId}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(
            fieldBase,
            "h-9 appearance-none pl-3 pr-8 text-sm",
            error && fieldError,
            className
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-navy-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </div>
    </Field>
  );
}

/** A checkbox with its label, aligned and clickable as one thing. */
export function Checkbox({
  label,
  description,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  const inputId = autoId(label, id) ?? React.useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        type="checkbox"
        id={inputId}
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-navy-900/25",
          "accent-[var(--color-navy-900)]",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        {...props}
      />
      <label htmlFor={inputId} className="cursor-pointer select-none">
        <span className="block text-[13px] font-medium leading-tight text-navy-800">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs leading-snug text-navy-400">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}
