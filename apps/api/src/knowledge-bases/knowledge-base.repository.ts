import { Injectable } from "@nestjs/common";
import { ApiError } from "@fococontext/contracts";

import type { KnowledgeBaseRecord } from "./knowledge-base.types.js";

@Injectable()
export class KnowledgeBaseRepository {
  private readonly records = new Map<string, KnowledgeBaseRecord>();

  create(record: KnowledgeBaseRecord): KnowledgeBaseRecord {
    if (this.records.has(record.id)) {
      throw new ApiError("resource_conflict", {
        details: {
          resource_type: "knowledge_base",
          field: "id",
        },
      });
    }

    const activeForkOwnerConflict = this.findActiveForkOwnerConflict(record);

    if (activeForkOwnerConflict !== undefined) {
      throw new ApiError("resource_conflict", {
        details: {
          resource_type: "knowledge_base",
          field: "fork_owner_external_id",
          scope: "project_upstream_owner",
        },
      });
    }

    this.records.set(record.id, cloneKnowledgeBaseRecord(record));

    return cloneKnowledgeBaseRecord(record);
  }

  list(): KnowledgeBaseRecord[] {
    return [...this.records.values()].map((record) => cloneKnowledgeBaseRecord(record));
  }

  findById(id: string): KnowledgeBaseRecord | undefined {
    const record = this.records.get(id);

    return record === undefined ? undefined : cloneKnowledgeBaseRecord(record);
  }

  update(record: KnowledgeBaseRecord): KnowledgeBaseRecord {
    this.records.set(record.id, cloneKnowledgeBaseRecord(record));

    return cloneKnowledgeBaseRecord(record);
  }

  replaceAll(records: readonly KnowledgeBaseRecord[]): void {
    this.records.clear();

    for (const record of records) {
      this.records.set(record.id, cloneKnowledgeBaseRecord(record));
    }
  }

  private findActiveForkOwnerConflict(
    record: KnowledgeBaseRecord,
  ): KnowledgeBaseRecord | undefined {
    if (
      record.knowledgeBaseType !== "fork" ||
      record.deletedAt !== undefined ||
      record.status === "deleted" ||
      record.upstreamKnowledgeBaseId === null ||
      record.forkOwner === null
    ) {
      return undefined;
    }

    return [...this.records.values()].find(
      (candidate) =>
        candidate.id !== record.id &&
        candidate.projectId === record.projectId &&
        candidate.deletedAt === undefined &&
        candidate.status !== "deleted" &&
        candidate.knowledgeBaseType === "fork" &&
        candidate.upstreamKnowledgeBaseId === record.upstreamKnowledgeBaseId &&
        candidate.forkOwner?.ownerType === record.forkOwner?.ownerType &&
        candidate.forkOwner?.externalOwnerId === record.forkOwner?.externalOwnerId,
    );
  }
}

function cloneKnowledgeBaseRecord(record: KnowledgeBaseRecord): KnowledgeBaseRecord {
  return {
    ...record,
    forkOwner:
      record.forkOwner === null
        ? null
        : {
            ...record.forkOwner,
          },
    schema: JSON.parse(JSON.stringify(record.schema)) as KnowledgeBaseRecord["schema"],
    retrieval: JSON.parse(JSON.stringify(record.retrieval)) as KnowledgeBaseRecord["retrieval"],
    datasetConfiguration: {
      ...record.datasetConfiguration,
      values: JSON.parse(
        JSON.stringify(record.datasetConfiguration.values),
      ) as KnowledgeBaseRecord["datasetConfiguration"]["values"],
      metadata: JSON.parse(
        JSON.stringify(record.datasetConfiguration.metadata),
      ) as KnowledgeBaseRecord["datasetConfiguration"]["metadata"],
    },
    systemPages: record.systemPages.map((page) => ({ ...page })),
  };
}
