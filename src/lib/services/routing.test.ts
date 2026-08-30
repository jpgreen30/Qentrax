import { describe, expect, it } from "vitest";
import {
  RoutingStrategy,
  selectWinnerByStrategy,
  type RoutingCandidate,
} from "./routing";
import { isScheduleActive } from "./eligibility";

function candidate(
  campaign_id: string,
  overrides: Partial<RoutingCandidate> = {},
): RoutingCandidate {
  return {
    campaign_id,
    eligible: true,
    bid_cents: 1000,
    bid_type: "fixed",
    rank: 0,
    weight: 1,
    priority: 100,
    remaining_capacity: null,
    ...overrides,
  };
}

describe("routing strategy selection", () => {
  it("selects the highest valid bid with deterministic tie breaking", () => {
    const candidates = [
      candidate("b", { bid_cents: 2500, rank: 1 }),
      candidate("a", { bid_cents: 2500, rank: 0 }),
      candidate("c", { bid_cents: 2000, rank: 2 }),
    ];

    expect(
      selectWinnerByStrategy(candidates, RoutingStrategy.HIGHEST_BID),
    ).toMatchObject({ campaign_id: "a", bid_cents: 2500 });
  });

  it("never selects an ineligible destination", () => {
    const winner = selectWinnerByStrategy(
      [
        candidate("blocked", { eligible: false, bid_cents: 999999 }),
        candidate("eligible", { bid_cents: 100 }),
      ],
      RoutingStrategy.HIGHEST_BID,
    );

    expect(winner?.campaign_id).toBe("eligible");
  });

  it("round robin distributes evenly from a durable cursor", () => {
    const candidates = [
      candidate("a", { rank: 0 }),
      candidate("b", { rank: 1 }),
      candidate("c", { rank: 2 }),
    ];
    const winners = Array.from({ length: 9 }, (_, position) =>
      selectWinnerByStrategy(
        candidates,
        RoutingStrategy.ROUND_ROBIN,
        position,
      )?.campaign_id,
    );

    expect(winners).toEqual(["a", "b", "c", "a", "b", "c", "a", "b", "c"]);
  });

  it("weighted round robin converges exactly for a 50/30/20 cycle", () => {
    const candidates = [
      candidate("a", { rank: 0, weight: 50 }),
      candidate("b", { rank: 1, weight: 30 }),
      candidate("c", { rank: 2, weight: 20 }),
    ];
    const counts = { a: 0, b: 0, c: 0 };

    for (let position = 0; position < 100; position += 1) {
      const id = selectWinnerByStrategy(
        candidates,
        RoutingStrategy.WEIGHTED_ROUND_ROBIN,
        position,
      )?.campaign_id as keyof typeof counts;
      counts[id] += 1;
    }

    expect(counts).toEqual({ a: 50, b: 30, c: 20 });
  });

  it("priority selects the lowest tier and uses bid as a tie breaker", () => {
    const winner = selectWinnerByStrategy(
      [
        candidate("low", { priority: 20, bid_cents: 5000 }),
        candidate("first", { priority: 5, bid_cents: 1000 }),
        candidate("best", { priority: 5, bid_cents: 1500 }),
      ],
      RoutingStrategy.PRIORITY,
    );

    expect(winner?.campaign_id).toBe("best");
  });

  it("capacity selects the destination with most remaining capacity", () => {
    const winner = selectWinnerByStrategy(
      [
        candidate("nearly-full", { remaining_capacity: 1, bid_cents: 5000 }),
        candidate("available", { remaining_capacity: 20, bid_cents: 1000 }),
      ],
      RoutingStrategy.CAPACITY,
    );

    expect(winner?.campaign_id).toBe("available");
  });

  it("waterfall selects the first eligible rank", () => {
    const winner = selectWinnerByStrategy(
      [
        candidate("second", { rank: 2 }),
        candidate("first", { rank: 1 }),
      ],
      RoutingStrategy.WATERFALL,
    );

    expect(winner?.campaign_id).toBe("first");
  });

  it("returns null when no candidate is eligible", () => {
    expect(
      selectWinnerByStrategy(
        [candidate("blocked", { eligible: false })],
        RoutingStrategy.HIGHEST_BID,
      ),
    ).toBeNull();
  });
});

describe("campaign schedule evaluation", () => {
  it("accepts a configured weekday window in its timezone", () => {
    const now = new Date("2026-08-31T17:30:00.000Z"); // Monday 10:30 PDT
    expect(
      isScheduleActive(
        {
          timezone: "America/Los_Angeles",
          days: ["mon"],
          windows: [{ start: "09:00", end: "17:00" }],
        },
        now,
      ),
    ).toBe(true);
  });

  it("rejects a time outside the configured window", () => {
    const now = new Date("2026-08-31T03:00:00.000Z"); // Sunday 20:00 PDT
    expect(
      isScheduleActive(
        {
          timezone: "America/Los_Angeles",
          days: ["sun"],
          windows: [{ start: "09:00", end: "17:00" }],
        },
        now,
      ),
    ).toBe(false);
  });

  it("supports overnight windows", () => {
    const now = new Date("2026-08-31T06:30:00.000Z"); // Sunday 23:30 PDT
    expect(
      isScheduleActive(
        {
          timezone: "America/Los_Angeles",
          days: ["sun"],
          windows: [{ start: "22:00", end: "02:00" }],
        },
        now,
      ),
    ).toBe(true);
  });

  it("fails closed for an invalid timezone or disabled schedule", () => {
    expect(isScheduleActive({ timezone: "Not/AZone" })).toBe(false);
    expect(isScheduleActive({ enabled: false })).toBe(false);
  });
});
