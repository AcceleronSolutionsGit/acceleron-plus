import React from "react";
import { cn } from "@/lib/utils";

// ─── Generic DataTable ─────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  /** Right-aligns and switches on tabular figures. Use for money and counts. */
  numeric?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  className?: string;
  rowClassName?: (item: T) => string;
  /** Keeps the header visible while the body scrolls. */
  stickyHeader?: boolean;
  /** Renders a tighter row. For tables that routinely run long. */
  dense?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = "Nothing here yet",
  className,
  rowClassName,
  stickyHeader = false,
  dense = false,
}: DataTableProps<T>) {
  const cellPad = dense ? "px-3.5 py-2" : "px-4 py-3";

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-navy-900/8 bg-surface shadow-xs",
        className
      )}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  // A tinted header instead of a solid navy bar. The bar
                  // competed with the sidebar for weight and made every
                  // table look like the most important thing on screen.
                  "bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-navy-500",
                  "whitespace-nowrap border-b border-navy-900/10",
                  cellPad,
                  col.numeric ? "text-right" : "text-left",
                  stickyHeader && "sticky top-0 z-10",
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-14 text-center text-[13px] text-navy-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={item.id}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  "group border-b border-navy-900/6 last:border-0",
                  "transition-colors duration-150",
                  onRowClick && "cursor-pointer hover:bg-navy-50/70",
                  rowClassName?.(item)
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "text-sm text-navy-800",
                      cellPad,
                      col.numeric && "text-right tabular-nums",
                      col.className
                    )}
                  >
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Label and value, stacked, for the detail panels that are really just
 * a list of facts about one record.
 */
export function FieldRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", className)}>
      <dt className="shrink-0 text-[12.5px] text-navy-400">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-medium text-navy-800">
        {children}
      </dd>
    </div>
  );
}
