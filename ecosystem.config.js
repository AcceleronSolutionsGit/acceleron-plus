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

module.exports = {
  apps: [
    {
      name: "acceleron-plus",
      cwd: __dirname,
      // Call Next's CLI directly rather than `npm start`, so pm2 manages
      // the real server process (signals, memory limit, restarts) and not
      // an npm wrapper around it.
      script: path.join(__dirname, "node_modules/next/dist/bin/next"),
      args: "start --port 3000 --hostname 127.0.0.1",

      // One instance. Uploaded documents and Next's cache sit on local
      // disk, and each instance opens its own pools to all four
      // databases (4 × DATABASE_POOL_MAX connections), so scale out only
      // after reading DEPLOY.md → "More than one instance".
      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "production",
        PORT: "3000",
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
        SWEEP_URL: "http://127.0.0.1:3000/api/notifications/sweep",
      },
      time: true,
      out_file: path.join(__dirname, "logs/sweep.out.log"),
      error_file: path.join(__dirname, "logs/sweep.err.log"),
    },
  ],
};
