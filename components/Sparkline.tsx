"use client";

import { useId } from "react";

/**
 * Tiny trend line with a soft fill. `splitAt` dims the points before it so a
 * "previous vs current" window reads at a glance. It wipes in left to right on mount.
 */
export default function Sparkline({
  values,
  splitAt,
  color = "#2563eb",
  height = 36,
}: {
  values: number[];
  splitAt?: number;
  color?: string;
  height?: number;
}) {
  const id = `spark${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (values.length < 2) return null;

  const width = 120;
  const max = Math.max(...values, 0) || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const splitX = splitAt !== undefined ? splitAt * step : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="clip-reveal h-9 w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        {splitX !== null && (
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2={width} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset={splitX / width} stopColor="#cbd5e1" />
            <stop offset={splitX / width} stopColor={color} />
          </linearGradient>
        )}
      </defs>
      <path d={area} fill={`url(#${id}-fill)`} />
      <path
        d={line}
        fill="none"
        stroke={splitX !== null ? `url(#${id}-stroke)` : color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
