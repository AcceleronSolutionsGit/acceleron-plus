import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/rollout";

/**
 * Where signing in lands you.
 *
 * A client has no business on the internal project list — it would
 * only 403 — so they go straight to their own portal. During the Phase 1
 * rollout a regular member starts on My Projects, the one place they can
 * ask to join a project. Everybody else starts where their work is.
 */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(homeFor(session.role));
}
