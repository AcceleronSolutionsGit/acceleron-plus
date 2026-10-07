import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support Portal — Acceleron Solutions",
  description: "Submit and track support tickets without signing in. Available at /support",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
