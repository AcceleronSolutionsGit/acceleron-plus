import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, mustChangePassword } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { required } = await searchParams;
  const forced = required === "1" || (await mustChangePassword());

  return (
    <div className="w-full max-w-md">
      <div className="flex justify-center mb-8">
        <Logo variant="full" />
      </div>

      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(33,47,96,0.08)] border border-neutral-50 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            {forced ? "Set a new password" : "Change your password"}
          </h1>
          <p className="text-sm text-navy-500 mt-2">
            {forced
              ? "Your password was issued by an administrator. Choose your own before continuing."
              : `Signed in as ${user.email}`}
          </p>
        </div>

        <ChangePasswordForm forced={forced} />
      </div>

      <p className="text-center text-xs text-navy-500/50 mt-6">
        © 2026 Acceleron Solutions. All rights reserved.
      </p>
    </div>
  );
}
