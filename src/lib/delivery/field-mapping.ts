/**
 * Applies an advertiser's field mapping to an outbound lead payload.
 *
 * A mapping is Qentrax field -> destination field. Storing one is not enough:
 * it has to actually rename keys on the way out, or the destination receives
 * Qentrax's names and the advertiser's CRM silently drops the lead.
 *
 * Source paths may be dotted ("consumer.email") so nested payload values can be
 * addressed without flattening the whole document first.
 */
export type FieldMapping = Record<string, string>;

export function readPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  let cursor: unknown = source;
  for (const segment of path.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Writes a dotted destination path, creating intermediate objects. */
export function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const next = cursor[key];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

export type MappingResult = {
  payload: Record<string, unknown>;
  /** Source fields the mapping named that the payload did not contain. */
  missing: string[];
};

/**
 * With no mapping configured the payload passes through unchanged, which is the
 * generic-webhook behaviour: send Qentrax's own shape.
 *
 * With a mapping configured, only mapped fields are sent. That is deliberate —
 * a destination expecting a fixed contract should not receive extra keys it did
 * not ask for, and it keeps unmapped PII from leaving by accident.
 */
export function applyFieldMapping(
  source: Record<string, unknown>,
  mapping: FieldMapping | null | undefined,
): MappingResult {
  const entries = Object.entries(mapping ?? {}).filter(([from, to]) => from && to);
  if (!entries.length) return { payload: { ...source }, missing: [] };

  const payload: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const [from, to] of entries) {
    const value = readPath(source, from);
    if (value === undefined) {
      missing.push(from);
      continue;
    }
    writePath(payload, to, value);
  }

  return { payload, missing };
}
