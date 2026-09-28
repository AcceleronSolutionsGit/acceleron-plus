import React from "react";
import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** A small status pip at the bottom-right. */
  status?: "online" | "away" | "offline";
}

const sizeStyles = {
  xs: "w-6 h-6 text-[9px]",
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-xs",
  lg: "w-11 h-11 text-sm",
};

/**
 * Six tints from the brand's own range. A person keeps the same one
 * everywhere because it comes from their name, which makes a team list
 * scannable by colour before you have read a single word of it.
 */
const TINTS = [
  "bg-[#2a3a72] text-white",
  "bg-[#3f6ea8] text-white",
  "bg-[#2f7d6b] text-white",
  "bg-[#7a5ea8] text-white",
  "bg-[#a8623f] text-white",
  "bg-[#4c5a8a] text-white",
];

function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TINTS[h % TINTS.length];
}

const statusColor = {
  online: "bg-success",
  away: "bg-warning",
  offline: "bg-navy-300",
};

export function Avatar({ name, avatarUrl, size = "md", className, status }: AvatarProps) {
  const pip = status && (
    <span
      className={cn(
        "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface",
        statusColor[status]
      )}
      aria-label={status}
    />
  );

  if (avatarUrl) {
    return (
      <span className={cn("relative inline-flex shrink-0", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name}
          className={cn("rounded-full object-cover ring-2 ring-surface", sizeStyles[size])}
        />
        {pip}
      </span>
    );
  }

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-surface",
          "select-none tracking-wide",
          tintFor(name),
          sizeStyles[size]
        )}
        title={name}
      >
        {getInitials(name)}
      </span>
      {pip}
    </span>
  );
}

/**
 * Overlapping avatars with a "+n" when the list runs long. The overlap
 * is what says "these people together" rather than "these people".
 */
export function AvatarStack({
  names,
  max = 4,
  size = "sm",
  className,
}: {
  names: string[];
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)}>
      {shown.map((n, i) => (
        <Avatar
          key={`${n}-${i}`}
          name={n}
          size={size}
          className={i > 0 ? "-ml-2" : undefined}
        />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            "-ml-2 inline-flex items-center justify-center rounded-full",
            "bg-navy-900/8 font-semibold text-navy-500 ring-2 ring-surface",
            sizeStyles[size]
          )}
          title={names.slice(max).join(", ")}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
