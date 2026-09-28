import type { NextConfig } from "next";

// Production serves the app as a folder of apps.acceleronsolutions.io —
// see src/lib/base-path.ts. Unset locally, so a laptop runs at "/".
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  serverExternalPackages: ['knex', 'pg', 'pdfkit'],
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
