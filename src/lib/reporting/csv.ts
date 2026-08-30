/**
 * Minimal RFC 4180 CSV writer.
 *
 * Values are quoted whenever they contain a delimiter, quote or newline, and
 * embedded quotes are doubled. A leading =, +, - or @ is prefixed with a single
 * quote so spreadsheet software treats an exported value as text rather than a
 * formula.
 */
const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_PREFIX = /^[=+\-@]/;

export function csvCell(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (NEEDS_QUOTING.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

export function centsToAmount(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}
