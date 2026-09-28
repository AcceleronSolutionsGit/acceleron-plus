import Image from "next/image";
import React from "react";

/**
 * The Acceleron Solutions identity.
 *
 * Two pieces, used in two different ways.
 *
 * **The wordmark** is the real artwork from `public/` — it is a drawn
 * logotype, not a typeface, so it is shipped as an image and never
 * re-set in a font that merely looks close. `-light` is the knockout
 * for navy surfaces; the chevron inside the "o" stays red in both.
 *
 * **The mark** is drawn here in SVG rather than loaded as the supplied
 * PNG. The PNG is 240px wide and goes soft the moment it is scaled, and
 * the mark is used at 28px in a collapsed rail and at 512px as an app
 * icon. As SVG it is sharp at either end, inherits `currentColor`, and
 * the chevron can be animated — which is what `animate` does on the
 * sign-in screen.
 */

function Mark({
  className = "",
  tone = "dark",
  animate = false,
}: {
  className?: string;
  tone?: "dark" | "light";
  animate?: boolean;
}) {
  const ring = tone === "light" ? "#ffffff" : "var(--color-navy-900, #212f60)";
  // Each instance needs its own mask id, or two marks on one page share
  // the first one's — which is how a logo ends up silently un-notched.
  const id = React.useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Acceleron Solutions"
    >
      <mask id={`ring-${id}`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
        <rect x="-10" y="-10" width="120" height="120" fill="#fff" />
        {/* The chevron, fattened, punched out of the ring so the two
            never touch. Matches the printed mark. */}
        <path
          d="M71 51.5 L86 33.5 L101 51.5 L101 59.5 L86 41.5 L71 59.5 Z"
          fill="#000"
          stroke="#000"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </mask>
      <circle
        cx="50"
        cy="50"
        r="37.85"
        fill="none"
        stroke={ring}
        strokeWidth="23.1"
        mask={`url(#ring-${id})`}
      />
      <path
        d="M74.5 50 L86 36 L97.5 50 L97.5 56.5 L86 42.5 L74.5 56.5 Z"
        fill="var(--color-red-600, #de1e24)"
        className={animate ? "logo-chevron" : undefined}
      />
    </svg>
  );
}

export function Logo({
  variant = "full",
  tone = "dark",
  animate = false,
  className = "",
}: {
  /** `full` = mark + wordmark; `mark` = the ring alone; `wordmark` = type alone. */
  variant?: "full" | "mark" | "wordmark";
  /** `light` for navy and other dark surfaces. */
  tone?: "dark" | "light";
  animate?: boolean;
  className?: string;
}) {
  const wordmark = tone === "light" ? "/logo-wordmark-light.png" : "/logo-wordmark.png";

  if (variant === "mark") {
    return <Mark className={className || "h-8 w-8"} tone={tone} animate={animate} />;
  }

  // `self-start shrink-0` is not decoration. Dropped into a flex column
  // the image is a flex item, and the default `align-items: stretch`
  // blows an `h-8 w-auto` logo out to the full column width — which
  // squashes the wordmark, because an <img> fills by default.
  const imageBase = "w-auto max-w-full self-start shrink-0";

  if (variant === "wordmark") {
    return (
      <Image
        src={wordmark}
        alt="Acceleron Solutions"
        width={597}
        height={151}
        priority
        className={`${imageBase} ${className || "h-8"}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className="h-8 w-8 shrink-0" tone={tone} animate={animate} />
      <Image
        src={wordmark}
        alt="Acceleron Solutions"
        width={597}
        height={151}
        priority
        className={`${imageBase} h-[22px]`}
      />
    </span>
  );
}

export { Mark as LogoMark };
