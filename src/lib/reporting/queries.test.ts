import { describe, it, expect } from "vitest";
import { fetchAllPages, REPORTING_PAGE_SIZE } from "./queries";

describe("fetchAllPages", () => {
  it("pages until a short batch, so totals are not truncated at one page", async () => {
    const total = REPORTING_PAGE_SIZE * 2 + 37;
    const all = Array.from({ length: total }, (_, i) => ({ id: `t${i}` }));
    const requested: Array<[number, number]> = [];

    const rows = await fetchAllPages<{ id: string }>((from, to) => {
      requested.push([from, to]);
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    });

    expect(rows).toHaveLength(total);
    expect(requested).toHaveLength(3);
    expect(requested[0]).toEqual([0, REPORTING_PAGE_SIZE - 1]);
  });

  it("regression: does not stop at the first 200 rows", async () => {
    const all = Array.from({ length: 850 }, (_, i) => ({ id: `t${i}` }));
    const rows = await fetchAllPages<{ id: string }>((from, to) =>
      Promise.resolve({ data: all.slice(from, to + 1), error: null }),
    );
    expect(rows).toHaveLength(850);
  });

  it("stops after a single request when the first batch is short", async () => {
    let calls = 0;
    const rows = await fetchAllPages<{ id: string }>(() => {
      calls += 1;
      return Promise.resolve({ data: [{ id: "a" }], error: null });
    });
    expect(rows).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it("returns empty for no rows without looping", async () => {
    let calls = 0;
    const rows = await fetchAllPages<{ id: string }>(() => {
      calls += 1;
      return Promise.resolve({ data: [], error: null });
    });
    expect(rows).toEqual([]);
    expect(calls).toBe(1);
  });

  it("surfaces a query error instead of silently reporting partial totals", async () => {
    await expect(
      fetchAllPages(() => Promise.resolve({ data: null, error: new Error("rls denied") })),
    ).rejects.toThrow("rls denied");
  });

  it("treats a null data payload as the end of the result set", async () => {
    const rows = await fetchAllPages<{ id: string }>(() =>
      Promise.resolve({ data: null, error: null }),
    );
    expect(rows).toEqual([]);
  });
});
