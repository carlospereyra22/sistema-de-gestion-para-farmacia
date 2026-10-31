import { useId } from "react";
import { DashboardChartDetail } from "./dashboard-chart-detail";

export function DashboardMiniChart({
  values,
  labels,
  color,
  bars = false,
  heading = "Detalle del gráfico",
}: {
  values: bigint[];
  labels: string[];
  color: string;
  bars?: boolean;
  heading?: string;
}) {
  const id = useId().replace(/:/g, "");
  const max = values.reduce((a, b) => (a > b ? a : b), 0n);
  const points = values.map((value, index) => ({
    x: 3 + (index * 94) / Math.max(1, values.length - 1),
    y: 47 - (max > 0n ? Number((value * 4000n) / max) / 100 : 0),
  }));
  // Horizontal tangents keep each curve between its real samples (no overshoot).
  const line = points
    .map((p, i) =>
      i === 0
        ? `M ${p.x} ${p.y}`
        : `C ${(points[i - 1]!.x + p.x) / 2} ${points[i - 1]!.y} ${(points[i - 1]!.x + p.x) / 2} ${p.y} ${p.x} ${p.y}`,
    )
    .join(" ");
  const description = labels.join("; ");
  return (
    <DashboardChartDetail
      title={heading}
      color={color}
      rows={labels.map((label) => {
        const separator = label.indexOf(": ");
        return {
          label: label.slice(0, separator),
          value: label.slice(separator + 2),
        };
      })}
    >
      <svg
        viewBox="0 0 100 52"
        className="h-14 w-24 shrink-0 overflow-visible"
        role="img"
        aria-label={description}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={color}
              stopOpacity={bars ? 0.75 : 0.25}
            />
            <stop
              offset="100%"
              stopColor={color}
              stopOpacity={bars ? 0.18 : 0}
            />
          </linearGradient>
        </defs>
        {bars ? (
          values.map((value, i) => {
            const height = max > 0n ? Number((value * 4000n) / max) / 100 : 0;
            const width = Math.min(18, 90 / Math.max(1, values.length));
            return (
              <rect
                key={i}
                x={(100 - values.length * width) / 2 + i * width}
                y={47 - height}
                width={Math.max(2, width - 5)}
                height={height}
                rx="2"
                fill={`url(#${id})`}
              />
            );
          })
        ) : (
          <>
            {points.length > 0 && (
              <path d={`${line} L 97 50 L 3 50 Z`} fill={`url(#${id})`} />
            )}
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
    </DashboardChartDetail>
  );
}
