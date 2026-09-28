"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const MIN_LENGTH = 10;

/** Mirrors validatePasswordStrength() in src/lib/password.ts. */
function describeProblem(value: string): string | null {
  if (!value) return null;
  if (value.length < MIN_LENGTH) return `At least ${MIN_LENGTH} characters.`;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (classes < 3) return "Use at least three of: lowercase, uppercase, number, symbol.";
  return null;
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strengthHint = useMemo(() => describeProblem(newPassword), [newPassword]);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    !loading && currentPassword && newPassword && !strengthHint && !mismatch && confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Could not change your password.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label={forced ? "Temporary password" : "Current password"}
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
        autoComplete="current-password"
        autoFocus
      />

      <Input
        label="New password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        autoComplete="new-password"
        error={strengthHint ?? undefined}
      />

      <Input
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
        error={mismatch ? "Passwords do not match." : undefined}
      />

      {!newPassword && (
        <p className="text-xs text-navy-500">
          At least {MIN_LENGTH} characters, using three of: lowercase, uppercase, number, symbol.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3"
        >
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
        {loading ? "Saving…" : "Update password"}
      </Button>

      <p className="text-xs text-navy-500 text-center">
        Changing your password signs you out everywhere else.
      </p>
    </form>
  );
}
