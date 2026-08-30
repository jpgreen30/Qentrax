/**
 * Reporting date ranges (Phase 10: 7D / 30D / 90D / custom).
 *
 * Ranges are resolved in the viewing organization's timezone and returned as
 * an inclusive-start / exclusive-end UTC instant pair, which is what the
 * transaction timestamps are stored in. The exclusive end means a lead created
 * at 23:59:59.999 on the last day is counted exactly once and never twice.
 */
export const RANGE_PRESETS = ["7d", "30d", "90d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type DateRange = {
  preset: RangePreset;
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
  timezone: string;
  /** Local calendar days covered, used to render empty buckets. */
  days: string[];
};

const PRESET_DAYS: Record<Exclude<RangePreset, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function isRangePreset(value: unknown): value is RangePreset {
  return typeof value === "string" && (RANGE_PRESETS as readonly string[]).includes(value);
}

/** The local calendar date at `instant`, as YYYY-MM-DD. */
export function localDayKey(instant: Date, timezone: string): string {
  // en-CA yields ISO-shaped YYYY-MM-DD, avoiding manual offset arithmetic.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The UTC instant of local midnight starting the given local day. */
export function startOfLocalDay(dayKey: string, timezone: string): Date {
  // Probe the zone's offset at the target day, then correct. Two passes settle
  // DST transitions, where the first guess can land on the wrong side.
  let guess = new Date(`${dayKey}T00:00:00Z`);
  for (let i = 0; i < 2; i += 1) {
    const rendered = localDayKey(guess, timezone);
    const renderedTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(guess);
    const [h, m, s] = renderedTime.split(":").map(Number);
    const localMs =
      Date.parse(`${rendered}T00:00:00Z`) + (h * 3600 + m * 60 + s) * 1000;
    const targetMs = Date.parse(`${dayKey}T00:00:00Z`);
    guess = new Date(guess.getTime() + (targetMs - localMs));
  }
  return guess;
}

export function addLocalDays(dayKey: string, delta: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function enumerateDays(startDay: string, endDayInclusive: string): string[] {
  const days: string[] = [];
  let cursor = startDay;
  // Guard against an inverted range producing an unbounded loop.
  while (cursor <= endDayInclusive && days.length < 1000) {
    days.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return days;
}

export function resolveDateRange(
  params: { range?: string | null; from?: string | null; to?: string | null },
  timezone: string,
  now: Date = new Date(),
): DateRange {
  const preset: RangePreset = isRangePreset(params.range) ? params.range : "30d";
  const today = localDayKey(now, timezone);

  let startDay: string;
  let endDay: string; // inclusive

  const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  if (preset === "custom" && isDay(params.from) && isDay(params.to)) {
    startDay = params.from <= params.to ? params.from : params.to;
    endDay = params.from <= params.to ? params.to : params.from;
  } else {
    const span = PRESET_DAYS[(preset === "custom" ? "30d" : preset) as Exclude<RangePreset, "custom">];
    endDay = today;
    startDay = addLocalDays(today, -(span - 1));
  }

  return {
    preset,
    start: startOfLocalDay(startDay, timezone),
    end: startOfLocalDay(addLocalDays(endDay, 1), timezone),
    timezone,
    days: enumerateDays(startDay, endDay),
  };
}
