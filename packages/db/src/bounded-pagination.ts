import { sql, type RawBuilder } from "kysely";

export interface StableIdTimeCursor {
  id: string;
  timestamp: string;
}

export interface StableIdTimeCheckpointCursor {
  cursor: StableIdTimeCursor | null;
  processedCount: number;
}

export function createDescendingStableIdTimeCursorPredicate(input: {
  cursor: StableIdTimeCursor | null;
  idExpression: RawBuilder<unknown>;
  timestampExpression: RawBuilder<unknown>;
}): RawBuilder<unknown> {
  if (input.cursor === null) {
    return sql`true`;
  }

  return sql`(
    ${input.timestampExpression} < ${input.cursor.timestamp}::timestamptz
    or (${input.timestampExpression} = ${input.cursor.timestamp}::timestamptz
      and ${input.idExpression} < ${input.cursor.id})
  )`;
}

export function createStableIdTimeCursor(input: {
  id: string;
  timestamp: string | Date;
}): StableIdTimeCursor {
  return {
    id: input.id,
    timestamp: normalizeStableCursorTimestamp(input.timestamp),
  };
}

export function createStableIdTimeCheckpointCursor(input: {
  cursor: StableIdTimeCursor | null;
  processedCount: number;
  cursorKey?: string;
}): Record<string, unknown> {
  const cursorKey = input.cursorKey ?? "cursor";
  const output: Record<string, unknown> = {
    processed_count: Math.max(0, input.processedCount),
  };

  if (input.cursor !== null) {
    output[cursorKey] = {
      id: input.cursor.id,
      timestamp: input.cursor.timestamp,
    };
  }

  return output;
}

export function readStableIdTimeCheckpointCursor(
  value: Record<string, unknown>,
  input: {
    cursorKey?: string;
  } = {},
): StableIdTimeCheckpointCursor {
  const cursorKey = input.cursorKey ?? "cursor";
  const cursorValue = normalizeRecord(value[cursorKey]);
  const id = cursorValue.id;
  const timestamp = cursorValue.timestamp;

  return {
    cursor:
      typeof id === "string" && typeof timestamp === "string"
        ? {
            id,
            timestamp: normalizeStableCursorTimestamp(timestamp),
          }
        : null,
    processedCount: readNonNegativeInteger(value.processed_count),
  };
}

function normalizeStableCursorTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.toISOString();

  if (Number.isNaN(date.getTime())) {
    throw new Error("Stable cursor timestamp is invalid.");
  }

  return timestamp;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function readNonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "bigint") {
    return Math.max(0, Number(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return 0;
}
