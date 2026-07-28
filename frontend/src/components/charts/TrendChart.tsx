'use client';

/**
 * Visits-over-time chart.
 *
 * Hand-built SVG rather than a charting library: the app needs exactly two
 * chart forms, and a dependency-free implementation keeps the bundle small and
 * gives full control over the accessibility and hover behaviour.
 *
 * Design decisions, and why:
 *  • **Area + line, not bars.** The series is a continuous daily measure over a
 *    30-day window; a line reads the *shape* of the trend, which is the
 *    question being asked. Bars would imply 30 discrete comparisons.
 *  • **One series, so no legend.** The chart title names the measure. A legend
 *    box for a single series is pure noise.
 *  • **Recessive axes.** Grid lines sit at low opacity behind the data, so the
 *    marks stay the most prominent thing on the surface.
 *  • **Crosshair + tooltip.** An SVG chart on the web is interactive by
 *    default; every point is readable on hover rather than only the labelled ones.
 *  • **A real table behind it.** Visually hidden, but present for screen readers
 *    and keyboard users — identity is never conveyed by the picture alone.
 */

import { useMemo, useState } from 'react';
import { formatDateKeyShort, formatNumber, pluralize } from '../../lib/format';
import type { DailyCount } from '../../lib/types';

export interface TrendChartProps {
  /** Daily counts, ascending by date, gap-free (the API zero-fills). */
  data: DailyCount[];
  /** Accessible description of what the chart shows. */
  label?: string;
  /** Height of the plot in viewBox units. */
  height?: number;
}

/** Internal viewBox geometry. The SVG scales; these units stay constant. */
const VIEW_WIDTH = 800;
const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

/**
 * Renders a daily-trend area chart.
 *
 * @param props Series data and options.
 * @returns The chart element.
 *
 * @example
 * <TrendChart data={overview.visitsOverTime} label="Visits per day" />
 */
export function TrendChart({
  data,
  label = 'Visits over time',
  height = 240,
}: TrendChartProps): React.JSX.Element {
  // Index of the point currently hovered, or null when the pointer is away.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const geometry = useMemo(() => buildGeometry(data, height), [data, height]);

  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-subtle">No visit data for this period yet.</p>
    );
  }

  const { points, areaPath, linePath, yTicks, xTicks, maxValue, plotWidth, plotHeight } = geometry;
  const total = data.reduce((sum, point) => sum + point.count, 0);
  const active = activeIndex !== null ? data[activeIndex] : null;

  /**
   * Maps a pointer position onto the nearest data point.
   *
   * Nearest-index (rather than exact hit-testing on a 2px line) makes the whole
   * vertical band a hit target, so the tooltip is easy to summon.
   *
   * @param event Pointer event on the SVG.
   */
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    // Convert client pixels into viewBox units, then into a data index.
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
    const ratio = (relativeX - PADDING.left) / plotWidth;
    const index = Math.round(ratio * (data.length - 1));
    setActiveIndex(Math.min(data.length - 1, Math.max(0, index)));
  };

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className="w-full touch-none"
        style={{ height: 'auto' }}
        role="img"
        aria-label={`${label}. ${formatNumber(total)} ${pluralize(total, 'visit')} across ${data.length} days.`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          {/* Vertical fade under the line: gives the series weight without
              obscuring the grid beneath it. */}
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* ---- Recessive grid and y-axis labels ---- */}
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={PADDING.left}
              y1={tick.y}
              x2={VIEW_WIDTH - PADDING.right}
              y2={tick.y}
              stroke="var(--color-border)"
              strokeWidth="1"
              // Kept faint so the data, not the scaffolding, carries the eye.
              opacity="0.5"
            />
            <text
              x={PADDING.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-[var(--color-subtle)] text-[11px]"
            >
              {formatNumber(tick.value)}
            </text>
          </g>
        ))}

        {/* ---- Series ---- */}
        <path d={areaPath} fill="url(#trend-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-series-1)"
          // 2px: readable at a glance without becoming a slab.
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* ---- x-axis labels: first, middle and last only, so they never collide ---- */}
        {xTicks.map((tick) => (
          <text
            key={tick.index}
            x={tick.x}
            y={height - 8}
            textAnchor={tick.anchor}
            className="fill-[var(--color-subtle)] text-[11px]"
          >
            {formatDateKeyShort(data[tick.index].date)}
          </text>
        ))}

        {/* ---- Hover crosshair and marker ---- */}
        {activeIndex !== null && (
          <g pointerEvents="none">
            <line
              x1={points[activeIndex].x}
              y1={PADDING.top}
              x2={points[activeIndex].x}
              y2={PADDING.top + plotHeight}
              stroke="var(--color-border-strong)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {/* The surface-coloured ring separates the marker from the line
                underneath it, keeping both readable where they overlap. */}
            <circle
              cx={points[activeIndex].x}
              cy={points[activeIndex].y}
              r="5"
              fill="var(--color-series-1)"
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* ---- Tooltip ----
          Rendered as HTML rather than SVG text so it can use real typography
          and a backdrop. Positioned as a percentage so it tracks the scaled SVG. */}
      {active && activeIndex !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(points[activeIndex].x / VIEW_WIDTH) * 100}%` }}
          role="tooltip"
        >
          <p className="font-medium text-content">{formatDateKeyShort(active.date)}</p>
          <p className="text-muted">
            {formatNumber(active.count)} {pluralize(active.count, 'visit')}
          </p>
        </div>
      )}

      {/* ---- Accessible data table ----
          `sr-only` keeps it out of the visual design while giving screen-reader
          and keyboard users the underlying numbers. */}
      <figcaption className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Visits</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.date}>
                <th scope="row">{point.date}</th>
                <td>{point.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>

      {/* Peak annotation: one selective direct label, rather than a number on
          every point, which would be unreadable at 30 points. */}
      <p className="mt-2 text-xs text-subtle">
        Peak: {formatNumber(maxValue)} {pluralize(maxValue, 'visit')} in a single day
      </p>
    </figure>
  );
}

/** Everything the renderer needs, derived once per data change. */
interface ChartGeometry {
  points: Array<{ x: number; y: number }>;
  areaPath: string;
  linePath: string;
  yTicks: Array<{ value: number; y: number }>;
  xTicks: Array<{ index: number; x: number; anchor: 'start' | 'middle' | 'end' }>;
  maxValue: number;
  plotWidth: number;
  plotHeight: number;
}

/**
 * Projects the series into SVG coordinates and builds the path strings.
 *
 * Pure and separate from rendering, so the geometry can be memoised and reasoned
 * about (or tested) without touching React.
 *
 * @param data   Daily counts.
 * @param height Total chart height in viewBox units.
 * @returns Points, paths and tick positions.
 */
function buildGeometry(data: DailyCount[], height: number): ChartGeometry {
  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;

  if (data.length === 0) {
    return {
      points: [], areaPath: '', linePath: '', yTicks: [], xTicks: [],
      maxValue: 0, plotWidth, plotHeight,
    };
  }

  const rawMax = Math.max(...data.map((point) => point.count));
  // A flat all-zero series must still render a sensible axis rather than
  // dividing by zero.
  const maxValue = rawMax === 0 ? 1 : rawMax;
  const niceMax = niceCeiling(maxValue);

  // With a single point there is no interval to divide, so pin it to the left.
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const points = data.map((point, index) => ({
    x: PADDING.left + index * step,
    // SVG y grows downward, so a larger count maps to a smaller y.
    y: PADDING.top + plotHeight - (point.count / niceMax) * plotHeight,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  // The area closes down to the baseline and back, filling under the line.
  const baseline = PADDING.top + plotHeight;
  const areaPath =
    `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baseline} ` +
    `L ${points[0].x.toFixed(2)} ${baseline} Z`;

  // Four gridlines is enough to read values without crowding the plot.
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = Math.round((niceMax / tickCount) * index);
    return { value, y: baseline - (value / niceMax) * plotHeight };
  });

  const lastIndex = data.length - 1;
  const xTicks: ChartGeometry['xTicks'] =
    data.length === 1
      ? [{ index: 0, x: points[0].x, anchor: 'middle' }]
      : [
          { index: 0, x: points[0].x, anchor: 'start' },
          {
            index: Math.floor(lastIndex / 2),
            x: points[Math.floor(lastIndex / 2)].x,
            anchor: 'middle',
          },
          { index: lastIndex, x: points[lastIndex].x, anchor: 'end' },
        ];

  return { points, areaPath, linePath, yTicks, xTicks, maxValue: rawMax, plotWidth, plotHeight };
}

/**
 * Rounds an axis maximum up to a readable value.
 *
 * Keeps tick labels as round numbers (10, 25, 50, 100) instead of arbitrary
 * ones like 37, which are slow to read.
 *
 * @param value Raw maximum in the data.
 * @returns A rounded ceiling at or above `value`.
 */
function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
