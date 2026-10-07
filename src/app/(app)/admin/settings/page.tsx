import React from "react";
import { redirect } from "next/navigation";
import { identityDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await getSession();
  if (session?.role !== "admin") {
    redirect("/");
  }

  const settings = await identityDb("app_settings").where({ id: "global" }).first();

  return <SettingsClient initialSettings={settings} />;
}
