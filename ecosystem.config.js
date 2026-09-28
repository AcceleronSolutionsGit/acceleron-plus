// ═══════════════════════════════════════════════════════════════
// pm2 process file for Acceleron Plus
//
//   pm2 start ecosystem.config.js        first time
//   pm2 reload ecosystem.config.js --update-env   after a deploy
//
// Secrets are NOT kept here. `next start` reads .env.local from this
// folder (the same file the migration scripts use), so put the
// production values there. See DEPLOY.md.
// ═══════════════════════════════════════════════════════════════

const path = require("path");

// The port Next listens on, on 127.0.0.1 only — Apache is what the
// outside world talks to. Change it here (or set APP_PORT) and in the
// Apache site's ProxyPass lines; deploy.sh reads APP_PORT too.
const PORT = process.env.APP_PORT || "8099";

// The folder the app is served from (NEXT_PUBLIC_BASE_PATH in .env.local,
// e.g. /acceleron-plus). Every route, the sweep's included, lives under it.
function readEnvLocal(key) {
  try {
    const text = require("fs").readFileSync(path.join(__dirname, ".env.local"), "utf8");
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || readEnvLocal("NEXT_PUBLIC_BASE_PATH")).replace(/\/+$/, "");

module.exports = {
  apps: [
    {
      name: "acceleron-plus",
      cwd: __dirname,
      // Call Next's CLI directly rather than `npm start`, so pm2 manages
      // the real server process (signals, memory limit, restarts) and not
      // an npm wrapper around it.
      script: path.join(__dirname, "node_modules/next/dist/bin/next"),
      args: `start --port ${PORT} --hostname 127.0.0.1`,

      // One instance. Uploaded documents and Next's cache sit on local
      // disk, and each instance opens its own pools to all four
      // databases (4 × DATABASE_POOL_MAX connections), so scale out only
      // after reading DEPLOY.md → "More than one instance".
      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "production",
        PORT,
      },

      autorestart: true,
      max_memory_restart: "1G",
      min_uptime: "20s",
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 10000, // let in-flight requests finish on reload

      time: true, // timestamp every log line
      merge_logs: true,
      out_file: path.join(__dirname, "logs/app.out.log"),
      error_file: path.join(__dirname, "logs/app.err.log"),
    },

    {
      // Daily overdue-milestone alerts (POST /api/notifications/sweep).
      // pm2 runs it once when started and then on the cron below; the
      // sweep is de-duplicated per milestone per day, so extra runs are
      // harmless. Cron uses the server's timezone.
      name: "acceleron-sweep",
      cwd: __dirname,
      script: path.join(__dirname, "scripts/notification-sweep.js"),
      exec_mode: "fork",
      instances: 1,
      autorestart: false,
      cron_restart: "0 8 * * *", // 08:00 every day
      env: {
        NODE_ENV: "production",
        SWEEP_URL: `http://127.0.0.1:${PORT}${BASE_PATH}/api/notifications/sweep`,
      },
      time: true,
      out_file: path.join(__dirname, "logs/sweep.out.log"),
      error_file: path.join(__dirname, "logs/sweep.err.log"),
    },

    {
      // Darwinbox employee auto-sync. Knocks every 15 minutes; the app
      // runs a sync only when it is switched on and due (Master Data →
      // Auto-sync). Most runs log "not run (not_due)" and exit.
      name: "acceleron-darwinbox-sync",
      cwd: __dirname,
      script: path.join(__dirname, "scripts/darwinbox-autosync.js"),
      exec_mode: "fork",
      instances: 1,
      autorestart: false,
      cron_restart: "*/15 * * * *",
      env: {
        NODE_ENV: "production",
        AUTOSYNC_URL: `http://127.0.0.1:${PORT}${BASE_PATH}/api/integrations/darwinbox/autosync`,
      },
      time: true,
      out_file: path.join(__dirname, "logs/darwinbox-sync.out.log"),
      error_file: path.join(__dirname, "logs/darwinbox-sync.err.log"),
    },
  ],
};
