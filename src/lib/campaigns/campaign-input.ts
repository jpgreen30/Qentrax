import { parseDollarsToCents, parseCodeList } from "@/lib/offers/offer-input";

/**
 * Parsing and validation for the advertiser Campaign Builder.
 *
 * Bids and budgets are validated against the offer version's own pricing rules,
 * so a campaign cannot be created that the offer would never honour.
 */
export const PACING_MODES = ["EVEN", "ASAP"] as const;
export type Pacing = (typeof PACING_MODES)[number];

export const DAY_LABELS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

/** A conservative allowlist; the database stores whatever IANA name is chosen. */
export const SUPPORTED_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export type DaypartWindow = {
  day_of_week: number;
  start_minute: number;
  end_minute: number;
};

export type CampaignInput = {
  name: string;
  timezone: string;
  base_bid_cents: number;
  daily_cap: number | null;
  hourly_cap: number | null;
  monthly_cap: number | null;
  daily_budget_cents: number | null;
  monthly_budget_cents: number | null;
  pacing: Pacing;
  states: string[];
  zips: string[];
  dayparts: DaypartWindow[];
};

export type OfferPricing = {
  pricing_mode: string;
  price_cents: number | null;
  floor_cents: number | null;
  ceiling_cents: number | null;
  geo_states_include?: string[];
};

export type CampaignParseResult =
  | { ok: true; value: CampaignInput }
  | { ok: false; errors: string[] };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** "09:00" to minutes from midnight. Returns null when unparseable. */
export function parseTimeToMinutes(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseCampaignInput(
  form: { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] },
  offer: OfferPricing,
): CampaignParseResult {
  const errors: string[] = [];

  const name = str(form.get("name"));
  if (!name) errors.push("Campaign name is required.");

  const timezone = str(form.get("timezone")) || "America/Los_Angeles";
  if (!(SUPPORTED_TIMEZONES as readonly string[]).includes(timezone)) {
    errors.push("Choose a supported timezone.");
  }

  const rawPacing = str(form.get("pacing")) || "ASAP";
  if (!(PACING_MODES as readonly string[]).includes(rawPacing)) {
    errors.push("Pacing must be EVEN or ASAP.");
  }

  const bid = parseDollarsToCents(str(form.get("base_bid")));
  let base_bid_cents = 0;
  if (bid === null) {
    errors.push("Bid must be an amount like 45.00.");
  } else if (bid === undefined) {
    errors.push("A bid is required.");
  } else if (bid <= 0) {
    errors.push("Bid must be greater than zero.");
  } else {
    base_bid_cents = bid;

    // Validate against the offer's own pricing rules.
    if (offer.pricing_mode === "fixed" && offer.price_cents != null && bid !== offer.price_cents) {
      errors.push(
        `This offer is fixed price at $${(offer.price_cents / 100).toFixed(2)}; the bid must match.`,
      );
    }
    if (offer.floor_cents != null && bid < offer.floor_cents) {
      errors.push(`Bid is below the offer floor of $${(offer.floor_cents / 100).toFixed(2)}.`);
    }
    if (offer.ceiling_cents != null && bid > offer.ceiling_cents) {
      errors.push(`Bid is above the offer ceiling of $${(offer.ceiling_cents / 100).toFixed(2)}.`);
    }
  }

  const intField = (field: string, label: string): number | null => {
    const raw = str(form.get(field));
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${label} must be a whole number of zero or more.`);
      return null;
    }
    return n;
  };

  const hourly_cap = intField("hourly_cap", "Hourly cap");
  const daily_cap = intField("daily_cap", "Daily cap");
  const monthly_cap = intField("monthly_cap", "Monthly cap");

  // A tighter outer cap can never be reached, which is almost always a mistake.
  if (hourly_cap != null && daily_cap != null && hourly_cap > daily_cap) {
    errors.push("Hourly cap cannot exceed the daily cap.");
  }
  if (daily_cap != null && monthly_cap != null && daily_cap > monthly_cap) {
    errors.push("Daily cap cannot exceed the monthly cap.");
  }

  const moneyField = (field: string, label: string): number | null => {
    const parsed = parseDollarsToCents(str(form.get(field)));
    if (parsed === null) {
      errors.push(`${label} must be an amount like 500.00.`);
      return null;
    }
    return parsed ?? null;
  };

  const daily_budget_cents = moneyField("daily_budget", "Daily budget");
  const monthly_budget_cents = moneyField("monthly_budget", "Monthly budget");

  if (daily_budget_cents != null && monthly_budget_cents != null
      && daily_budget_cents > monthly_budget_cents) {
    errors.push("Daily budget cannot exceed the monthly budget.");
  }
  // A budget that cannot cover one lead buys nothing.
  if (daily_budget_cents != null && base_bid_cents > 0 && daily_budget_cents < base_bid_cents) {
    errors.push("Daily budget is smaller than a single lead at this bid.");
  }

  const states = parseCodeList(str(form.get("states")), (s) => s.toUpperCase());
  const zips = parseCodeList(str(form.get("zips")), (s) => s);
  for (const s of states) {
    if (!/^[A-Z]{2}$/.test(s)) errors.push(`"${s}" is not a two-letter state code.`);
  }
  for (const z of zips) {
    if (!/^\d{5}$/.test(z)) errors.push(`"${z}" is not a five-digit ZIP code.`);
  }

  // Targeting outside the offer's own geography would never match.
  const offerStates = offer.geo_states_include ?? [];
  if (offerStates.length && states.length) {
    const outside = states.filter((s) => !offerStates.includes(s));
    if (outside.length) {
      errors.push(
        `This offer does not cover ${outside.join(", ")}. It is available in ${offerStates.join(", ")}.`,
      );
    }
  }

  // Dayparts arrive as parallel arrays from the repeating window rows.
  const days = form.getAll("daypart_day").map((v) => String(v));
  const starts = form.getAll("daypart_start").map((v) => String(v));
  const ends = form.getAll("daypart_end").map((v) => String(v));

  const dayparts: DaypartWindow[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const dayRaw = days[i]?.trim();
    const startRaw = starts[i]?.trim() ?? "";
    const endRaw = ends[i]?.trim() ?? "";
    if (!dayRaw && !startRaw && !endRaw) continue;

    const day = Number(dayRaw);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      errors.push("Each schedule row needs a valid day.");
      continue;
    }
    const start = parseTimeToMinutes(startRaw);
    const end = parseTimeToMinutes(endRaw);
    if (start === null || end === null) {
      errors.push("Schedule times must look like 09:00.");
      continue;
    }
    if (start >= end) {
      errors.push("A schedule window must end after it starts.");
      continue;
    }
    const duplicate = dayparts.some(
      (w) => w.day_of_week === day && w.start_minute === start && w.end_minute === end,
    );
    if (!duplicate) {
      dayparts.push({ day_of_week: day, start_minute: start, end_minute: end });
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name, timezone, base_bid_cents, daily_cap, hourly_cap, monthly_cap,
      daily_budget_cents, monthly_budget_cents, pacing: rawPacing as Pacing,
      states, zips, dayparts,
    },
  };
}
