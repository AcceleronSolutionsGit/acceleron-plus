"use client";

/**
 * Chart component library for Acceleron Project+.
 *
 * A thin wrapper around Recharts that enforces the Acceleron design system:
 *   – consistent colour palette (navy / blue / red / green / amber / …)
 *   – rounded shapes, soft shadows, and an anti-aliased grid
 *   – shared tooltip styling and legend formatting
 *
 * These are layout-agnostic: drop them into a Card and they fill the width.
 * Height is always explicit to avoid CLS.
 */

import React from "react";
import {
  ResponsiveContainer,
  PieChart as RPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Line,
  ComposedChart,
  Area,
  AreaChart as RAreaChart,
  LineChart as RLineChart,
} from "recharts";

// ─── Shared palette ──────────────────────────────────────────────────
// Ordered so that adjacent slices in a pie or bars in a group always
// contrast well, even on a grey or white card.

export const CHART_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#14b8a6", // teal-500
  "#a855f7", // purple-500
  "#64748b", // slate-500
];

// ─── Shared tooltip ─────────────────────────────────────────────────

const CustomTooltip = ({
  active,
  payload,
  label,
  formatValue,
}: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-navy-900 px-4 py-3 text-white shadow-xl border border-navy-700/50 text-xs">
      {label && (
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">
          {label}
        </p>
      )}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: entry.color || entry.fill }}
          />
          <span className="text-white/70">{entry.name || entry.dataKey}:</span>
          <span className="font-bold text-white">
            {formatValue ? formatValue(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Shared legend ──────────────────────────────────────────────────

const CustomLegend = ({ payload }: any) => (
  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[11px]">
    {payload?.map((entry: any, i: number) => (
      <span key={i} className="flex items-center gap-1.5 text-navy-600">
        <span
          className="h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ background: entry.color }}
        />
        {entry.value}
      </span>
    ))}
  </div>
);

// ─── Pie Chart ──────────────────────────────────────────────────────

interface PieData {
  name: string;
  value: number;
}

export function AccPieChart({
  data,
  height = 280,
  innerRadius = 55,
  outerRadius = 100,
  colors = CHART_COLORS,
  formatValue,
  showLegend = true,
}: {
  data: PieData[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  colors?: string[];
  formatValue?: (v: number) => string;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
          animationBegin={0}
          animationDuration={800}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={colors[i % colors.length]}
              className="transition-opacity duration-200 hover:opacity-80"
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
        {showLegend && <Legend content={<CustomLegend />} />}
      </RPieChart>
    </ResponsiveContainer>
  );
}

// ─── Bar Chart ──────────────────────────────────────────────────────

interface BarSeries {
  dataKey: string;
  name: string;
  color?: string;
  stackId?: string;
  radius?: number;
}

export function AccBarChart({
  data,
  bars,
  xKey = "name",
  height = 280,
  formatValue,
  showGrid = true,
  showLegend = true,
}: {
  data: any[];
  bars: BarSeries[];
  xKey?: string;
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} barCategoryGap="20%">
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e2e8f0"
            vertical={false}
          />
        )}
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
        />
        <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
        {showLegend && <Legend content={<CustomLegend />} />}
        {bars.map((b, i) => (
          <Bar
            key={b.dataKey}
            dataKey={b.dataKey}
            name={b.name}
            fill={b.color || CHART_COLORS[i]}
            stackId={b.stackId}
            radius={b.radius ?? [4, 4, 0, 0]}
            animationBegin={i * 100}
            animationDuration={600}
          />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}

// ─── Line Chart ─────────────────────────────────────────────────────

interface LineSeries {
  dataKey: string;
  name: string;
  color?: string;
  dashed?: boolean;
  dot?: boolean;
}

export function AccLineChart({
  data,
  lines,
  xKey = "name",
  height = 280,
  formatValue,
  showGrid = true,
  showLegend = true,
}: {
  data: any[];
  lines: LineSeries[];
  xKey?: string;
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data}>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e2e8f0"
            vertical={false}
          />
        )}
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
        />
        <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
        {showLegend && <Legend content={<CustomLegend />} />}
        {lines.map((l, i) => (
          <Line
            key={l.dataKey}
            type="monotone"
            dataKey={l.dataKey}
            name={l.name}
            stroke={l.color || CHART_COLORS[i]}
            strokeWidth={2.5}
            strokeDasharray={l.dashed ? "6 4" : undefined}
            dot={
              l.dot !== false
                ? {
                    r: 3.5,
                    fill: l.color || CHART_COLORS[i],
                    stroke: "#fff",
                    strokeWidth: 2,
                  }
                : false
            }
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
            animationDuration={800}
          />
        ))}
      </RLineChart>
    </ResponsiveContainer>
  );
}

// ─── Area Chart (good for burn-down / burn-up) ──────────────────────

interface AreaSeries {
  dataKey: string;
  name: string;
  color?: string;
  fillOpacity?: number;
  dashed?: boolean;
}

export function AccAreaChart({
  data,
  areas,
  xKey = "name",
  height = 280,
  formatValue,
  showGrid = true,
  showLegend = true,
}: {
  data: any[];
  areas: AreaSeries[];
  xKey?: string;
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={data}>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e2e8f0"
            vertical={false}
          />
        )}
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
        />
        <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
        {showLegend && <Legend content={<CustomLegend />} />}
        {areas.map((a, i) => (
          <Area
            key={a.dataKey}
            type="monotone"
            dataKey={a.dataKey}
            name={a.name}
            stroke={a.color || CHART_COLORS[i]}
            strokeWidth={2}
            strokeDasharray={a.dashed ? "6 4" : undefined}
            fill={a.color || CHART_COLORS[i]}
            fillOpacity={a.fillOpacity ?? 0.08}
            animationDuration={800}
          />
        ))}
      </RAreaChart>
    </ResponsiveContainer>
  );
}

// ─── Composed (Bar + Line on same chart) ────────────────────────────

export function AccComposedChart({
  data,
  bars,
  lines,
  xKey = "name",
  height = 280,
  formatValue,
  showGrid = true,
  showLegend = true,
}: {
  data: any[];
  bars: BarSeries[];
  lines: LineSeries[];
  xKey?: string;
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} barCategoryGap="20%">
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e2e8f0"
            vertical={false}
          />
        )}
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatValue}
        />
        <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
        {showLegend && <Legend content={<CustomLegend />} />}
        {bars.map((b, i) => (
          <Bar
            key={b.dataKey}
            dataKey={b.dataKey}
            name={b.name}
            fill={b.color || CHART_COLORS[i]}
            radius={b.radius ?? [4, 4, 0, 0]}
            animationDuration={600}
          />
        ))}
        {lines.map((l, i) => (
          <Line
            key={l.dataKey}
            type="monotone"
            dataKey={l.dataKey}
            name={l.name}
            stroke={l.color || CHART_COLORS[bars.length + i]}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: "#fff", stroke: l.color || CHART_COLORS[bars.length + i], strokeWidth: 2 }}
            animationDuration={800}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
