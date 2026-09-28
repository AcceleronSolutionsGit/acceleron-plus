// ═══════════════════════════════════════════════════════════════
// Darwinbox employee sync — tracked runs and the automatic schedule.
//
// Every sync, whether an admin clicked "Sync with Darwinbox" or the
// schedule fired, goes through runTrackedSync():
//   • one at a time — a click during an automatic run is told so rather
//     than starting a second, overlapping import
//   • recorded in darwinbox_sync_runs, so the screen can say when the
//     master was last refreshed and whether it worked
//
// The schedule itself is decided in darwinbox-schedule.ts; a pm2 job
// (scripts/darwinbox-autosync.js) knocks every 15 minutes and this file
// decides whether it is time.
// ═══════════════════════════════════════════════════════════════

import { identityDb } from "./db";
import { syncDarwinboxEmployees, type DarwinboxSyncResult } from "./darwinbox";
import {
  isAutosyncDue,
  isFrequency,
  nextAutosyncAt,
  type AutosyncFrequency,
  type AutosyncSettings,
} from "./darwinbox-schedule";

/** A sync that has held the lock this long is assumed dead (server restart). */
const STALE_LOCK = "30 minutes";

export interface SyncRun {
  id: string;
  trigger: "manual" | "auto";
  triggeredByUserId: string | null;
  startedAt: string;
  finishedAt: string | null;
  success: boolean | null;
  message: string | null;
  totalProcessed: number | null;
  created: number | null;
  updated: number | null;
  deactivated: number | null;
}

export interface AutosyncOverview {
  settings: AutosyncSettings & { updatedAt: string | null };
  running: boolean;
  runningSince: string | null;
  nextRunAt: string | null;
  lastRun: SyncRun | null;
  lastAutoRun: SyncRun | null;
  recentRuns: SyncRun[];
}

type Row = Record<string, unknown>;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function iso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function mapRun(row: Row): SyncRun {
  return {
    id: String(row.id),
    trigger: row.trigger === "auto" ? "auto" : "manual",
    triggeredByUserId: row.triggered_by_user_id ? String(row.triggered_by_user_id) : null,
    startedAt: iso(row.started_at) ?? new Date(0).toISOString(),
    finishedAt: iso(row.finished_at),
    success: row.success === null || row.success === undefined ? null : Boolean(row.success),
    message: row.message ? String(row.message) : null,
    totalProcessed: num(row.total_processed),
    created: num(row.created_count),
    updated: num(row.updated_count),
    deactivated: num(row.deactivated_count),
  };
}

async function loadSettingsRow(): Promise<Row> {
  const row = (await identityDb("darwinbox_sync_settings").where("id", 1).first()) as Row | undefined;
  if (row) return row;
  // The migration inserts it; recreate rather than fail if someone removed it.
  await identityDb("darwinbox_sync_settings")
    .insert({ id: 1, enabled: true, frequency: "daily", daily_hour: 2, enabled_at: new Date() })
    .onConflict("id")
    .ignore();
  return (await identityDb("darwinbox_sync_settings").where("id", 1).first()) as Row;
}

function toSettings(row: Row): AutosyncSettings {
  return {
    enabled: Boolean(row.enabled),
    frequency: isFrequency(row.frequency) ? row.frequency : "daily",
    dailyHour: Number(row.daily_hour ?? 2),
    enabledAt: toDate(row.enabled_at),
  };
}

async function lastRunOf(trigger?: "auto" | "manual"): Promise<SyncRun | null> {
  const q = identityDb("darwinbox_sync_runs").orderBy("started_at", "desc");
  if (trigger) q.where("trigger", trigger);
  const row = (await q.first()) as Row | undefined;
  return row ? mapRun(row) : null;
}

export async function getAutosyncOverview(now: Date = new Date()): Promise<AutosyncOverview> {
  const [row, lastRun, lastAutoRun, recent] = await Promise.all([
    loadSettingsRow(),
    lastRunOf(),
    lastRunOf("auto"),
    identityDb("darwinbox_sync_runs").orderBy("started_at", "desc").limit(10),
  ]);
  const settings = toSettings(row);
  const runningSince = toDate(row.running_since);
  const stale = runningSince ? now.getTime() - runningSince.getTime() > 30 * 60 * 1000 : true;
  const next = nextAutosyncAt(settings, toDate(lastAutoRun?.startedAt), now);

  return {
    settings: { ...settings, updatedAt: iso(row.updated_at) },
    running: Boolean(runningSince) && !stale,
    runningSince: runningSince && !stale ? runningSince.toISOString() : null,
    // A time in the past means "at the next check", within 15 minutes.
    nextRunAt: next ? new Date(Math.max(next.getTime(), now.getTime())).toISOString() : null,
    lastRun,
    lastAutoRun,
    recentRuns: (recent as Row[]).map(mapRun),
  };
}

export async function updateAutosyncSettings(
  input: { enabled?: boolean; frequency?: AutosyncFrequency; dailyHour?: number },
  userId: string
): Promise<void> {
  const current = toSettings(await loadSettingsRow());
  const updates: Row = { updated_at: new Date(), updated_by_user_id: userId };

  if (input.enabled !== undefined) {
    updates.enabled = input.enabled;
    // Count the schedule from the moment it is switched on.
    if (input.enabled && !current.enabled) updates.enabled_at = new Date();
  }
  if (input.frequency !== undefined) updates.frequency = input.frequency;
  if (input.dailyHour !== undefined) updates.daily_hour = input.dailyHour;

  await identityDb("darwinbox_sync_settings").where("id", 1).update(updates);
}

export type TrackedSyncOutcome =
  | { busy: true; runningSince: string | null }
  | { busy: false; run: SyncRun; result: DarwinboxSyncResult };

/**
 * Run the employee sync once, recorded, and never alongside another.
 * The lock is a timestamp on the settings row, claimed atomically; a
 * lock older than 30 minutes is treated as left over from a crash.
 */
export async function runTrackedSync(trigger: "manual" | "auto", userId: string | null): Promise<TrackedSyncOutcome> {
  await loadSettingsRow();

  const claimed = await identityDb("darwinbox_sync_settings")
    .where("id", 1)
    .andWhere(function () {
      this.whereNull("running_since").orWhere(
        "running_since",
        "<",
        identityDb.raw(`now() - interval '${STALE_LOCK}'`)
      );
    })
    .update({ running_since: identityDb.fn.now() }, ["id"]);

  if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) {
    const row = await loadSettingsRow();
    return { busy: true, runningSince: iso(row.running_since) };
  }

  const [runRow] = (await identityDb("darwinbox_sync_runs")
    .insert({ trigger, triggered_by_user_id: userId, started_at: new Date() })
    .returning("*")) as Row[];

  let result: DarwinboxSyncResult;
  try {
    result = await syncDarwinboxEmployees();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = { success: false, message, error: message };
  }

  try {
    const [finished] = (await identityDb("darwinbox_sync_runs")
      .where("id", runRow.id as string)
      .update({
        finished_at: new Date(),
        success: result.success,
        message: result.message?.slice(0, 2000) ?? null,
        total_processed: result.totalProcessed ?? null,
        created_count: result.created ?? null,
        updated_count: result.updated ?? null,
        deactivated_count: result.deactivated ?? null,
      })
      .returning("*")) as Row[];
    return { busy: false, run: mapRun(finished ?? runRow), result };
  } finally {
    await identityDb("darwinbox_sync_settings").where("id", 1).update({ running_since: null });
  }
}

export type AutosyncTickResult =
  | { ran: false; reason: "disabled" | "not_due" | "busy"; nextRunAt: string | null }
  | { ran: true; run: SyncRun; result: DarwinboxSyncResult };

/** What the scheduler calls every 15 minutes. */
export async function runAutosyncIfDue(now: Date = new Date()): Promise<AutosyncTickResult> {
  const settings = toSettings(await loadSettingsRow());
  const lastAuto = await lastRunOf("auto");
  const next = nextAutosyncAt(settings, toDate(lastAuto?.startedAt), now);

  if (!settings.enabled) return { ran: false, reason: "disabled", nextRunAt: null };
  if (!isAutosyncDue(settings, toDate(lastAuto?.startedAt), now)) {
    return { ran: false, reason: "not_due", nextRunAt: next?.toISOString() ?? null };
  }

  const outcome = await runTrackedSync("auto", null);
  if (outcome.busy) return { ran: false, reason: "busy", nextRunAt: next?.toISOString() ?? null };
  return { ran: true, run: outcome.run, result: outcome.result };
}
