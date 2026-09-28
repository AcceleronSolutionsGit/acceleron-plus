import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['knex', 'pg', 'pdfkit'],
};

export default nextConfig;
