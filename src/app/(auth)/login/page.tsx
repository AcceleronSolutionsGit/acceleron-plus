"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Step = "email" | "code";

const CODE_LENGTH = 6;

function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-bg px-3.5 py-3 text-[13px] text-danger animate-[reveal_260ms_var(--ease-out-soft)_both]"
    >
      <svg className="mt-px h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 3.4a.9.9 0 01.9.97l-.28 3.9a.62.62 0 01-1.24 0l-.28-3.9A.9.9 0 018 3.4zM8 10.8a1 1 0 110 2 1 1 0 010-2z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/**
 * Six boxes, one input.
 *
 * The boxes are drawn; the input sits on top of them, transparent and
 * full width. Doing it the other way — six real inputs wired together
 * — breaks paste, breaks the iOS "from Messages" autofill, and gives a
 * screen reader six unlabelled fields. This keeps one field with one
 * label and `autocomplete="one-time-code"`, and still looks like six.
 */
function CodeBoxes({
  value,
  length,
  onChange,
  inputRef,
  invalid,
}: {
  value: string;
  length: number;
  onChange: (next: string) => void;
  inputRef: React.Ref<HTMLInputElement>;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const cursor = Math.min(value.length, length - 1);

  return (
    <div className="relative">
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          const active = focused && i === cursor;
          return (
            <div
              key={i}
              className={[
                "font-mono grid h-[52px] place-items-center rounded-lg border text-[22px] font-medium",
                "transition-[border-color,box-shadow,background] duration-200 ease-[var(--ease-out-soft)]",
                invalid
                  ? "border-danger/50 bg-danger-bg/40 text-danger"
                  : active
                    ? "border-navy-700 bg-surface text-navy-900 shadow-[0_0_0_3px_rgb(33_47_96_/_0.12)]"
                    : filled
                      ? "border-navy-900/20 bg-surface text-navy-900"
                      : "border-navy-900/12 bg-surface-2 text-navy-300",
              ].join(" ")}
            >
              {value[i] ?? ""}
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        required
        aria-label={`${length}-digit sign-in code`}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devCode, setDevCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Expiry countdown.
  useEffect(() => {
    if (step !== "code" || secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [step, secondsLeft]);

  // Resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  const backToEmail = useCallback((message?: string) => {
    setStep("email");
    setCode("");
    setPassword("");
    setDevCode("");
    setSecondsLeft(0);
    setCooldown(0);
    setError(message ?? "");
    setNotice("");
  }, []);

  // ─── Step 1: ask for a code ──────────────────────────────────────
  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Could not send a sign-in code.");
        return;
      }

      setStep("code");
      setNotice(data.message || "");
      setDevCode(data.devCode || "");
      // `emailSent` is dev-only now, so fall back to the truthful default.
      setEmailSent(data.devCode ? Boolean(data.emailSent) : true);
      setSecondsLeft(Number(data.expiresInSeconds ?? 300));
      setCooldown(30);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: submit the code ─────────────────────────────────────
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password: password || undefined }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.passwordRequired) {
          setPasswordRequired(true);
          setError(data.error || "Enter your password as well.");
          return;
        }
        if (data.restart) {
          backToEmail(data.error || "Please start again.");
          return;
        }
        setError(data.error || "That code is not right.");
        setCode("");
        codeInputRef.current?.focus();
        return;
      }

      router.push(
        data.mustChangePassword
          ? "/change-password?required=1"
          : from || data.landing || "/"
      );
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/resend-otp", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.restart) {
          backToEmail(data.error || "Please start again.");
          return;
        }
        setError(data.error || "Could not send a new code.");
        if (data.retryAfterSeconds) setCooldown(Number(data.retryAfterSeconds));
        return;
      }

      setNotice("A new code is on its way.");
      setDevCode(data.devCode || "");
      setSecondsLeft(Number(data.expiresInSeconds ?? 300));
      setCooldown(30);
      setCode("");
      codeInputRef.current?.focus();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const mmss = (total: number) =>
    `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

  // ─── Email step ──────────────────────────────────────────────────
  if (step === "email") {
    return (
      <form onSubmit={requestCode} className="space-y-5">
        <Input
          label="Work email"
          type="email"
          placeholder="you@acceleronsolutions.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />

        {error && <ErrorNote message={error} />}

        <Button type="submit" block size="lg" loading={loading} disabled={!email}>
          Send sign-in code
        </Button>

        <p className="text-center text-[12.5px] text-navy-400">
          We&apos;ll email you a {CODE_LENGTH}-digit code. No password needed.
        </p>
      </form>
    );
  }

  // ─── Code step ───────────────────────────────────────────────────
  return (
    <form onSubmit={submitCode} className="space-y-5">
      <div>
        <p className="text-sm text-navy-700">
          {emailSent ? "We sent a code to" : "Code generated for"}{" "}
          <span className="font-medium text-navy-900">{email}</span>
        </p>
        <button
          type="button"
          onClick={() => backToEmail()}
          className="text-xs text-navy-700 hover:underline mt-1 cursor-pointer"
        >
          Use a different email
        </button>
      </div>

      {devCode && (
        <div className="rounded-lg border border-warning/25 bg-warning-bg px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
            Development mode
          </p>
          <p className="font-mono mt-1.5 text-[26px] font-medium leading-none tracking-[0.28em] text-navy-900">
            {devCode}
          </p>
          <p className="mt-2 text-[11.5px] leading-snug text-warning/85">
            Shown because this is not a production build. It is also printed in
            your terminal.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <span className="block text-[13px] font-semibold text-navy-700">
          {CODE_LENGTH}-digit code
        </span>
        <CodeBoxes
          value={code}
          length={CODE_LENGTH}
          onChange={setCode}
          inputRef={codeInputRef}
          invalid={Boolean(error) && !passwordRequired}
        />
      </div>

      {passwordRequired && (
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      )}

      {!error && secondsLeft > 0 && (
        <p className="text-xs text-navy-500">
          {/* The hedged "if that address belongs to an account" wording exists
              to avoid confirming which emails are real. Once the code is on
              screen in dev, it just reads as noise. */}
          {devCode ? "Enter the code above." : notice} Expires in {mmss(secondsLeft)}.
        </p>
      )}

      {secondsLeft === 0 && !error && (
        <p className="text-xs text-red-600">That code has expired. Ask for a new one.</p>
      )}

      {error && <ErrorNote message={error} />}

      <Button
        type="submit"
        block
        size="lg"
        loading={loading}
        disabled={code.length < CODE_LENGTH}
      >
        Sign in
      </Button>

      <button
        type="button"
        onClick={resend}
        disabled={resending || cooldown > 0}
        className="w-full cursor-pointer text-[12.5px] font-medium text-navy-600 transition-colors hover:text-navy-900 hover:underline disabled:cursor-not-allowed disabled:text-navy-300 disabled:no-underline"
      >
        {cooldown > 0
          ? `Resend code in ${cooldown}s`
          : resending
            ? "Sending…"
            : "Send a new code"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-[400px]">
      {/* The mark only appears here on narrow screens; on a desktop the
          left panel is already carrying the identity, and two logos on
          one screen is one too many. */}
      <div className="mb-8 flex justify-center lg:hidden">
        <Logo variant="full" animate />
      </div>

      <div className="mb-7 hidden lg:block">
        <Logo variant="mark" animate className="h-10 w-10" />
      </div>

      <h1 className="text-display text-[30px] font-bold leading-tight tracking-[-0.025em] text-navy-900">
        Welcome back
      </h1>
      <p className="mt-2 text-[14px] text-navy-500">
        Sign in to Acceleron Plus to continue.
      </p>

      <div className="mt-7">
        <Suspense
          fallback={
            <div className="flex h-48 items-center justify-center text-sm text-navy-400">
              Loading…
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>

      <p className="mt-10 text-[11.5px] text-navy-300 lg:hidden">
        © {new Date().getFullYear()} Acceleron Solutions
      </p>
    </div>
  );
}
