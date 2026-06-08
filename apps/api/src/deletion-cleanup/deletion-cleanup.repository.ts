import { Injectable } from "@nestjs/common";

import type {
  DeletionCleanupItemRecord,
  DeletionCleanupOperationRecord,
  DeletionCleanupRepositorySnapshot,
  DeletionCleanupStatus,
  DeletionCleanupTargetType,
} from "./deletion-cleanup.types.js";

@Injectable()
export class DeletionCleanupRepository {
  private readonly operations = new Map<string, DeletionCleanupOperationRecord>();
  private readonly items = new Map<string, DeletionCleanupItemRecord>();

  createOperation(record: DeletionCleanupOperationRecord): DeletionCleanupOperationRecord {
    this.operations.set(record.id, cloneOperation(record));

    return cloneOperation(record);
  }

  updateOperation(record: DeletionCleanupOperationRecord): DeletionCleanupOperationRecord {
    this.operations.set(record.id, cloneOperation(record));

    return cloneOperation(record);
  }

  findOperationById(id: string): DeletionCleanupOperationRecord | undefined {
    const record = this.operations.get(id);

    return record === undefined ? undefined : cloneOperation(record);
  }

  findLatestOperationForTarget(input: {
    targetType: DeletionCleanupTargetType;
    targetId: string;
  }): DeletionCleanupOperationRecord | undefined {
    const records = [...this.operations.values()]
      .filter(
        (record) => record.targetType === input.targetType && record.targetId === input.targetId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return records[0] === undefined ? undefined : cloneOperation(records[0]);
  }

  listOperations(
    input: {
      knowledgeBaseId?: string;
      status?: DeletionCleanupStatus;
    } = {},
  ): DeletionCleanupOperationRecord[] {
    return [...this.operations.values()]
      .filter((record) =>
        input.knowledgeBaseId === undefined
          ? true
          : record.knowledgeBaseId === input.knowledgeBaseId,
      )
      .filter((record) => (input.status === undefined ? true : record.status === input.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => cloneOperation(record));
  }

  replaceItemsForOperation(
    operationId: string,
    records: readonly DeletionCleanupItemRecord[],
  ): DeletionCleanupItemRecord[] {
    for (const item of [...this.items.values()]) {
      if (item.operationId === operationId) {
        this.items.delete(item.id);
      }
    }
    for (const record of records) {
      this.items.set(record.id, cloneItem(record));
    }

    return this.listItemsByOperationId(operationId);
  }

  upsertItem(record: DeletionCleanupItemRecord): DeletionCleanupItemRecord {
    this.items.set(record.id, cloneItem(record));

    return cloneItem(record);
  }

  listItemsByOperationId(operationId: string): DeletionCleanupItemRecord[] {
    return [...this.items.values()]
      .filter((record) => record.operationId === operationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((record) => cloneItem(record));
  }

  pruneExpiredRecords(now: string): { deletedItems: number; deletedOperations: number } {
    let deletedItems = 0;
    let deletedOperations = 0;

    for (const item of [...this.items.values()]) {
      if (item.retainedUntil !== null && item.retainedUntil <= now) {
        this.items.delete(item.id);
        deletedItems += 1;
      }
    }

    for (const operation of [...this.operations.values()]) {
      if (operation.retentionExpiresAt !== null && operation.retentionExpiresAt <= now) {
        this.operations.delete(operation.id);
        deletedOperations += 1;

        for (const item of [...this.items.values()]) {
          if (item.operationId === operation.id) {
            this.items.delete(item.id);
            deletedItems += 1;
          }
        }
      }
    }

    return {
      deletedItems,
      deletedOperations,
    };
  }

  replaceSnapshot(snapshot: DeletionCleanupRepositorySnapshot): void {
    this.operations.clear();
    this.items.clear();

    for (const operation of snapshot.operations) {
      this.operations.set(operation.id, cloneOperation(operation));
    }
    for (const item of snapshot.items) {
      this.items.set(item.id, cloneItem(item));
    }
  }
}

function cloneOperation(record: DeletionCleanupOperationRecord): DeletionCleanupOperationRecord {
  return {
    ...record,
    manifest: JSON.parse(JSON.stringify(record.manifest)) as Record<string, unknown>,
    lastError:
      record.lastError === null
        ? null
        : (JSON.parse(JSON.stringify(record.lastError)) as Record<string, unknown>),
  };
}

function cloneItem(record: DeletionCleanupItemRecord): DeletionCleanupItemRecord {
  return {
    ...record,
    lastError:
      record.lastError === null
        ? null
        : (JSON.parse(JSON.stringify(record.lastError)) as Record<string, unknown>),
  };
}
