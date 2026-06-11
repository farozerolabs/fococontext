export interface IdempotentBatchWriteResult {
  attempted: number;
  batches: number;
  skipped: number;
  written: number;
}

export interface IdempotentBatchWriteChunkResult {
  skipped?: number;
  written?: number;
}

export interface WriteIdempotentBatchesInput<TItem> {
  batchSize: number;
  getIdempotencyKey: (item: TItem) => string;
  items: readonly TItem[];
  writeBatch: (items: readonly TItem[]) => Promise<IdempotentBatchWriteChunkResult | void>;
}

export async function writeIdempotentBatches<TItem>(
  input: WriteIdempotentBatchesInput<TItem>,
): Promise<IdempotentBatchWriteResult> {
  const batchSize = normalizeBatchSize(input.batchSize);
  const dedupedItems = dedupeItemsByStableKey(input.items, input.getIdempotencyKey);
  let batches = 0;
  let skipped = input.items.length - dedupedItems.length;
  let written = 0;

  for (let index = 0; index < dedupedItems.length; index += batchSize) {
    const batch = dedupedItems.slice(index, index + batchSize);
    const result = await input.writeBatch(batch);

    batches += 1;
    skipped += result?.skipped ?? 0;
    written += result?.written ?? batch.length;
  }

  return {
    attempted: input.items.length,
    batches,
    skipped,
    written,
  };
}

export function dedupeItemsByStableKey<TItem>(
  items: readonly TItem[],
  getIdempotencyKey: (item: TItem) => string,
): TItem[] {
  const seen = new Set<string>();
  const dedupedItems: TItem[] = [];

  for (const item of items) {
    const key = getIdempotencyKey(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedItems.push(item);
  }

  return dedupedItems;
}

function normalizeBatchSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}
