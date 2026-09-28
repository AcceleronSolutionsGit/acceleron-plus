import type { NextConfig } from "next";

// Production serves the app as a folder of apps.acceleronsolutions.io —
// see src/lib/base-path.ts. Unset locally, so a laptop runs at "/".
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  serverExternalPackages: ['knex', 'pg', 'pdfkit'],
  // On the server the app sits in /srv/www/htdocs/acceleron-plus, and
  // /srv/www/htdocs has another project's package-lock.json. Without this,
  // Next guesses the parent is the workspace root and warns on every start.
  outputFileTracingRoot: process.cwd(),
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
