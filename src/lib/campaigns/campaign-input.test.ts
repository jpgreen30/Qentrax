import { describe, it, expect } from "vitest";
import {
  parseCampaignInput,
  parseTimeToMinutes,
  minutesToTime,
  type OfferPricing,
} from "./campaign-input";

function form(single: Record<string, string>, multi: Record<string, string[]> = {}) {
  return {
    get: (n: string) => (n in single ? single[n] : null),
    getAll: (n: string) => multi[n] ?? [],
  };
}

const FIXED: OfferPricing = {
  pricing_mode: "fixed", price_cents: 4500, floor_cents: null, ceiling_cents: null,
};
const FLOOR: OfferPricing = {
  pricing_mode: "floor", price_cents: null, floor_cents: 3000, ceiling_cents: 8000,
};

const BASE = { name: "CA Solar", base_bid: "45.00", timezone: "America/Los_Angeles" };
const parse = (
  over: Record<string, string> = {},
  multi: Record<string, string[]> = {},
  offer: OfferPricing = FIXED,
) => parseCampaignInput(form({ ...BASE, ...over }, multi), offer);

describe("parseTimeToMinutes", () => {
  it("converts a clock time to minutes from midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("09:00")).toBe(540);
    expect(parseTimeToMinutes("17:30")).toBe(1050);
    expect(parseTimeToMinutes("24:00")).toBe(1440);
  });

  it("rejects malformed or out-of-range times", () => {
    expect(parseTimeToMinutes("9am")).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("09:60")).toBeNull();
    expect(parseTimeToMinutes("24:30")).toBeNull();
  });

  it("round-trips through minutesToTime", () => {
    for (const t of ["00:00", "09:00", "17:30", "23:59"]) {
      expect(minutesToTime(parseTimeToMinutes(t)!)).toBe(t);
    }
  });
});

describe("bid validation against the offer", () => {
  it("accepts a bid matching a fixed-price offer", () => {
    const r = parse();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.base_bid_cents).toBe(4500);
  });

  it("rejects a bid that does not match a fixed-price offer", () => {
    const r = parse({ base_bid: "40.00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("fixed price");
  });

  it("rejects a bid below the offer floor", () => {
    const r = parse({ base_bid: "20.00" }, {}, FLOOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("below the offer floor");
  });

  it("rejects a bid above the offer ceiling", () => {
    const r = parse({ base_bid: "90.00" }, {}, FLOOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("above the offer ceiling");
  });

  it("accepts a bid between the floor and ceiling", () => {
    expect(parse({ base_bid: "50.00" }, {}, FLOOR).ok).toBe(true);
  });

  it("requires a positive bid", () => {
    expect(parse({ base_bid: "" }).ok).toBe(false);
    expect(parse({ base_bid: "0" }).ok).toBe(false);
  });
});

describe("caps and budgets", () => {
  it("stores caps as whole numbers and money as cents", () => {
    const r = parse({ hourly_cap: "5", daily_cap: "50", monthly_cap: "500", daily_budget: "500.00" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.hourly_cap).toBe(5);
      expect(r.value.daily_cap).toBe(50);
      expect(r.value.monthly_cap).toBe(500);
      expect(r.value.daily_budget_cents).toBe(50000);
    }
  });

  it("leaves unspecified caps null rather than zero", () => {
    const r = parse();
    expect(r.ok && r.value.daily_cap).toBeNull();
    expect(r.ok && r.value.daily_budget_cents).toBeNull();
  });

  it("rejects an hourly cap above the daily cap", () => {
    const r = parse({ hourly_cap: "100", daily_cap: "10" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("Hourly cap cannot exceed");
  });

  it("rejects a daily cap above the monthly cap", () => {
    expect(parse({ daily_cap: "100", monthly_cap: "10" }).ok).toBe(false);
  });

  it("rejects a daily budget above the monthly budget", () => {
    expect(parse({ daily_budget: "500.00", monthly_budget: "100.00" }).ok).toBe(false);
  });

  it("rejects a daily budget that cannot cover a single lead", () => {
    const r = parse({ daily_budget: "10.00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("single lead");
  });

  it("rejects a fractional or negative cap", () => {
    expect(parse({ daily_cap: "1.5" }).ok).toBe(false);
    expect(parse({ daily_cap: "-1" }).ok).toBe(false);
  });
});

describe("geography", () => {
  it("normalizes states and validates shape", () => {
    const r = parse({ states: "ca, nv" });
    expect(r.ok && r.value.states).toEqual(["CA", "NV"]);
    expect(parse({ states: "California" }).ok).toBe(false);
    expect(parse({ zips: "9021" }).ok).toBe(false);
  });

  it("rejects targeting a state the offer does not cover", () => {
    const offer = { ...FIXED, geo_states_include: ["CA"] };
    const r = parse({ states: "CA, TX" }, {}, offer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("does not cover TX");
  });

  it("accepts targeting within the offer's geography", () => {
    const offer = { ...FIXED, geo_states_include: ["CA", "NV"] };
    expect(parse({ states: "CA" }, {}, offer).ok).toBe(true);
  });
});

describe("dayparts", () => {
  const windows = (days: string[], starts: string[], ends: string[]) => ({
    daypart_day: days, daypart_start: starts, daypart_end: ends,
  });

  it("parses parallel window rows", () => {
    const r = parse({}, windows(["1", "2"], ["09:00", "10:00"], ["17:00", "18:00"]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.dayparts).toEqual([
        { day_of_week: 1, start_minute: 540, end_minute: 1020 },
        { day_of_week: 2, start_minute: 600, end_minute: 1080 },
      ]);
    }
  });

  it("ignores entirely blank rows", () => {
    const r = parse({}, windows(["1", ""], ["09:00", ""], ["17:00", ""]));
    expect(r.ok && r.value.dayparts).toHaveLength(1);
  });

  it("treats no windows as an always-on campaign", () => {
    const r = parse();
    expect(r.ok && r.value.dayparts).toEqual([]);
  });

  it("rejects a window that ends before it starts", () => {
    const r = parse({}, windows(["1"], ["17:00"], ["09:00"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("end after it starts");
  });

  it("rejects an invalid day or malformed time", () => {
    expect(parse({}, windows(["9"], ["09:00"], ["17:00"])).ok).toBe(false);
    expect(parse({}, windows(["1"], ["9am"], ["17:00"])).ok).toBe(false);
  });

  it("drops duplicate windows rather than failing the insert", () => {
    const r = parse({}, windows(["1", "1"], ["09:00", "09:00"], ["17:00", "17:00"]));
    expect(r.ok && r.value.dayparts).toHaveLength(1);
  });

  it("keeps two distinct windows on the same day", () => {
    const r = parse({}, windows(["6", "6"], ["10:00", "14:00"], ["12:00", "16:00"]));
    expect(r.ok && r.value.dayparts).toHaveLength(2);
  });
});

describe("timezone and pacing", () => {
  it("defaults to Pacific and ASAP", () => {
    const r = parseCampaignInput(form({ name: "x", base_bid: "45.00" }), FIXED);
    expect(r.ok && r.value.timezone).toBe("America/Los_Angeles");
    expect(r.ok && r.value.pacing).toBe("ASAP");
  });

  it("accepts EVEN pacing and a supported timezone", () => {
    const r = parse({ pacing: "EVEN", timezone: "America/New_York" });
    expect(r.ok && r.value.pacing).toBe("EVEN");
    expect(r.ok && r.value.timezone).toBe("America/New_York");
  });

  it("rejects an unsupported timezone or pacing", () => {
    expect(parse({ timezone: "Mars/Olympus" }).ok).toBe(false);
    expect(parse({ pacing: "SLOW" }).ok).toBe(false);
  });

  it("requires a name and reports all problems at once", () => {
    const r = parseCampaignInput(form({ name: "", base_bid: "", timezone: "Mars/Olympus" }), FIXED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
