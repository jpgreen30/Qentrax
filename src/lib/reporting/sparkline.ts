import type { DailyPoint } from "./metrics";

export type SeriesMetric = "spendCents" | "revenueCents" | "billableLeads";

export type SparklinePath = {
  /** SVG path for the trend line, or null when there is nothing to plot. */
  line: string | null;
  /** Closed path for the area fill, or null. */
  area: string | null;
  max: number;
  hasData: boolean;
};

/**
 * Derives an SVG path from real daily values.
 *
 * Reporting previously shipped a fixed decorative path captioned "Illustrative
 * shape", which moved regardless of the data behind it. Returning nulls for an
 * all-zero series is deliberate: the caller renders an explicit empty state
 * rather than a flat line that reads as a measurement.
 */
export function buildSparkline(
  points: readonly DailyPoint[],
  metric: SeriesMetric,
  width = 700,
  height = 230,
): SparklinePath {
  const values = points.map((p) => p[metric]);
  const max = values.reduce((m, v) => (v > m ? v : m), 0);

  if (points.length < 2 || max <= 0) {
    return { line: null, area: null, max, hasData: false };
  }

  const stepX = width / (points.length - 1);
  const coords = values.map((v, i) => {
    const x = Math.round(i * stepX * 100) / 100;
    // Invert: SVG y grows downward. Reserve a little headroom at the top.
    const y = Math.round((height - (v / max) * (height * 0.9)) * 100) / 100;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height}Z`;

  return { line, area, max, hasData: true };
}
