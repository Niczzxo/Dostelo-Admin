'use client';

/**
 * Small SVG charts for the redesigned portal, drawn from the
 * real series the pages pass in. No chart library: an area chart
 * with a smoothed path, a donut with a centre total, and a bar
 * chart. Empty series render the caller's empty state instead;
 * these components never invent data.
 */

export interface ChartPoint {
  label: string;
  value: number;
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0]!.x} ${points[0]!.y}`;
  }
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({
  points,
  height = 190,
  formatValue,
  stroke = '#7C5CFF',
}: {
  points: ChartPoint[];
  height?: number;
  formatValue?: (value: number) => string;
  stroke?: string;
}) {
  const width = 640;
  const padX = 8;
  const padTop = 14;
  const padBottom = 24;
  const max = Math.max(...points.map((p) => p.value), 0);
  const safeMax = max === 0 ? 1 : max;
  const stepX =
    points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: padX + index * stepX,
    y:
      padTop +
      (1 - point.value / safeMax) * (height - padTop - padBottom),
    label: point.label,
    value: point.value,
  }));
  const line = smoothPath(coords);
  const area =
    coords.length > 0
      ? `${line} L ${coords[coords.length - 1]!.x} ${height - padBottom} L ${coords[0]!.x} ${height - padBottom} Z`
      : '';
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Trend chart"
    >
      <defs>
        <linearGradient id="adm-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <line
          key={fraction}
          x1={padX}
          x2={width - padX}
          y1={padTop + fraction * (height - padTop - padBottom)}
          y2={padTop + fraction * (height - padTop - padBottom)}
          stroke="#E9E6F5"
          strokeWidth="1"
        />
      ))}
      {area ? <path d={area} fill="url(#adm-area-fill)" /> : null}
      {line ? (
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.6" />
      ) : null}
      {coords.map((point, index) => (
        <g key={index}>
          <circle cx={point.x} cy={point.y} r="3.4" fill={stroke}>
            <title>
              {point.label}:{' '}
              {formatValue ? formatValue(point.value) : point.value}
            </title>
          </circle>
          {index % labelEvery === 0 ? (
            <text
              x={point.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="10.5"
              fill="#7E7A94"
            >
              {point.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  slices,
  size = 168,
  centreLabel,
  centreValue,
}: {
  slices: DonutSlice[];
  size?: number;
  centreLabel: string;
  centreValue: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const fraction = total === 0 ? 0 : slice.value / total;
      const dash = fraction * circumference;
      const arc = (
        <circle
          key={slice.label}
          cx="84"
          cy="84"
          r={radius}
          fill="none"
          stroke={slice.color}
          strokeWidth="17"
          strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference}`}
          strokeDashoffset={-offset}
          transform="rotate(-90 84 84)"
          strokeLinecap="butt"
        >
          <title>
            {slice.label}: {slice.value}
          </title>
        </circle>
      );
      offset += dash;
      return arc;
    });
  return (
    <div className="donut-wrap">
      <svg
        viewBox="0 0 168 168"
        style={{ width: size, height: size, flexShrink: 0 }}
        role="img"
        aria-label="Distribution chart"
      >
        <circle
          cx="84"
          cy="84"
          r={radius}
          fill="none"
          stroke="#F0EDFA"
          strokeWidth="17"
        />
        {arcs}
        <text
          x="84"
          y="80"
          textAnchor="middle"
          fontSize="21"
          fontWeight="700"
          fill="#1D1B2E"
        >
          {centreValue}
        </text>
        <text x="84" y="99" textAnchor="middle" fontSize="11" fill="#7E7A94">
          {centreLabel}
        </text>
      </svg>
      <div className="legend-list">
        {slices.map((slice) => (
          <div className="legend-row" key={slice.label}>
            <span
              className="legend-dot"
              style={{ background: slice.color }}
            />
            <span>{slice.label}</span>
            <span className="legend-value">
              {slice.value.toLocaleString('en-US')}
              {total > 0
                ? ` (${Math.round((slice.value / total) * 100)}%)`
                : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  points,
  height = 170,
  color = '#7C5CFF',
  formatValue,
}: {
  points: ChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
}) {
  const width = 640;
  const padBottom = 24;
  const padTop = 12;
  const max = Math.max(...points.map((p) => p.value), 0);
  const safeMax = max === 0 ? 1 : max;
  const slot = points.length > 0 ? width / points.length : width;
  const barWidth = Math.min(44, slot * 0.55);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Bar chart"
    >
      {points.map((point, index) => {
        const barHeight =
          (point.value / safeMax) * (height - padTop - padBottom);
        const x = index * slot + (slot - barWidth) / 2;
        const y = height - padBottom - barHeight;
        return (
          <g key={index}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, point.value > 0 ? 3 : 0)}
              rx="5"
              fill={color}
              opacity={point.value === 0 ? 0.25 : 0.9}
            >
              <title>
                {point.label}:{' '}
                {formatValue ? formatValue(point.value) : point.value}
              </title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize="10.5"
              fill="#7E7A94"
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
