import type { ObjectStorageAdapter } from "@fococontext/storage";

import type { DocumentProcessingStateStore } from "./document-processing-state.js";

export interface DocumentProcessingIntermediateCleanupResult {
  checkpointsDeleted: number;
  objectDeleteFailures: number;
  objectKeysDeleted: number;
  unitsDeleted: number;
}

export interface DocumentProcessingIntermediateCleanerOptions {
  batchSize: number;
  now?: () => string;
  objectStorage: ObjectStorageAdapter;
  stateStore: DocumentProcessingStateStore;
}

export class DocumentProcessingIntermediateCleaner {
  private readonly batchSize: number;
  private readonly now: () => string;

  constructor(private readonly options: DocumentProcessingIntermediateCleanerOptions) {
    this.batchSize = Math.max(1, Math.floor(options.batchSize));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async cleanupExpired(): Promise<DocumentProcessingIntermediateCleanupResult> {
    const now = this.now();
    const objectKeys = await this.options.stateStore.listExpiredObjectKeys({
      limit: this.batchSize,
      now,
    });
    const deleteResult =
      objectKeys.length === 0
        ? { deleted: [], failed: [] }
        : await this.options.objectStorage.deleteObjects({ keys: objectKeys });
    const dbResult = await this.options.stateStore.cleanupExpired({
      limit: this.batchSize,
      now,
    });

    return {
      checkpointsDeleted: dbResult.checkpointsDeleted,
      objectDeleteFailures: deleteResult.failed.length,
      objectKeysDeleted: deleteResult.deleted.length,
      unitsDeleted: dbResult.unitsDeleted,
    };
  }
}
