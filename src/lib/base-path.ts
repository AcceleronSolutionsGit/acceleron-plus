// ═══════════════════════════════════════════════════════════════
// Serving the app under a sub-path
//
// On the production server every app lives under one domain as a folder:
// https://apps.acceleronsolutions.io/acceleron-plus/. Next.js handles
// that with `basePath` (next.config.ts) for <Link>, router.push,
// redirect() and its own assets. It does NOT touch plain strings — a
// fetch("/api/..."), window.location, an <a href>, a CSS url(), a
// cookie path, next/image src — so those go through here.
//
// Set NEXT_PUBLIC_BASE_PATH=/acceleron-plus in .env.local BEFORE
// building (it is baked into the build). Leave it unset on a laptop and
// everything behaves exactly as before.
//
// Client-side fetch("/api/...") calls — there are over a hundred — are
// prefixed in one place by a small script in app/layout.tsx rather than
// edited one by one, so a new call cannot forget it.
// ═══════════════════════════════════════════════════════════════

export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/+$/, "");

/** "/api/x" → "/acceleron-plus/api/x". Leaves absolute URLs and already-prefixed paths alone. */
export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`) || path.startsWith(`${BASE_PATH}?`)) return path;
  return `${BASE_PATH}${path}`;
}

/** Cookie path: the app's own folder, so other apps on the same domain never receive our cookies. */
export const COOKIE_PATH = BASE_PATH || "/";

/**
 * Inline script for <head>: wraps window.fetch so that fetch("/api/…")
 * goes to the app's folder. Runs before any app code. Next's own
 * requests already carry the base path and are left untouched.
 */
export function fetchBasePathScript(): string {
  if (!BASE_PATH) return "";
  const b = JSON.stringify(BASE_PATH);
  return `(function(){var b=${b};var f=window.fetch;if(!f||f.__basePath)return;function p(u){return typeof u==="string"&&u.charAt(0)==="/"&&u.charAt(1)!=="/"&&u!==b&&u.indexOf(b+"/")!==0&&u.indexOf(b+"?")!==0?b+u:u}var w=function(i,o){return f.call(this,p(i),o)};w.__basePath=true;window.fetch=w;})();`;
}
