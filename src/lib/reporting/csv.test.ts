import { describe, it, expect } from "vitest";
import { csvCell, csvRow, toCsv, centsToAmount } from "./csv";

describe("csvCell", () => {
  it("passes plain values through unquoted", () => {
    expect(csvCell("solar")).toBe("solar");
    expect(csvCell(42)).toBe("42");
  });

  it("renders null and undefined as empty, not the literal words", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes values containing a comma, quote or newline", () => {
    expect(csvCell("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes a value that a spreadsheet would evaluate as a formula", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+ping")).toBe("'+ping");
    expect(csvCell("@name")).toBe("'@name");
    expect(csvCell("-5")).toBe("'-5");
  });

  it("quotes a formula-prefixed value that also contains a comma", () => {
    expect(csvCell("=A1,B1")).toBe(`"'=A1,B1"`);
  });
});

describe("toCsv", () => {
  it("writes a header and CRLF-terminated rows", () => {
    const out = toCsv(["day", "spend"], [["2026-08-01", "10.00"]]);
    expect(out).toBe("day,spend\r\n2026-08-01,10.00\r\n");
  });

  it("writes a header-only file when there are no rows", () => {
    expect(toCsv(["day"], [])).toBe("day\r\n");
  });
});

describe("csvRow", () => {
  it("joins mixed cell types", () => {
    expect(csvRow(["a", 1, null])).toBe("a,1,");
  });
});

describe("centsToAmount", () => {
  it("formats integer cents as a two-decimal amount", () => {
    expect(centsToAmount(1234)).toBe("12.34");
    expect(centsToAmount(0)).toBe("0.00");
    expect(centsToAmount(null)).toBe("0.00");
  });
});
