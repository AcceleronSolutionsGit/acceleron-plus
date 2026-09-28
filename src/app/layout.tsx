import type { Metadata } from "next";
import "./globals.css";
import { withBase, fetchBasePathScript } from "@/lib/base-path";

// Fonts are self-hosted and imported from globals.css (@fontsource).
//
// They used to come from next/font/google, which made every production
// build depend on being able to reach fonts.googleapis.com — a build
// machine behind a firewall simply failed, with an error that pointed
// at CSS rather than at the network. Nothing here reaches outside now.

export const metadata: Metadata = {
  title: "Acceleron Plus",
  description:
    "Professional services automation for Acceleron Solutions — projects, service desk, people and margin in one place.",
  icons: {
    icon: withBase("/favicon-64.png"),
    apple: withBase("/apple-icon.png"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {fetchBasePathScript() && (
        <head>
          {/* Sub-path hosting: fetch("/api/…") → fetch("/acceleron-plus/api/…"). */}
          <script dangerouslySetInnerHTML={{ __html: fetchBasePathScript() }} />
        </head>
      )}
      <body className="antialiased">{children}</body>
    </html>
  );
}
