import { ApiError } from "@fococontext/contracts";

import { cloneJsonObject } from "./knowledge-base.helpers.js";
import type {
  DatasetConfigurationRecord,
  DatasetConfigurationResponse,
  DatasetConfigurationValues,
  KnowledgeBaseRecord,
  KnowledgeBaseResponse,
  SystemPageRecord,
} from "./knowledge-base.types.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";

export function compareUpdatedAtDesc(
  leftUpdatedAt: string,
  leftId: string,
  rightUpdatedAt: string,
  rightId: string,
): number {
  const updatedAtOrder = rightUpdatedAt.localeCompare(leftUpdatedAt);

  return updatedAtOrder === 0 ? rightId.localeCompare(leftId) : updatedAtOrder;
}

export function toOperationalListError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("internal_error");
}

export function toDatasetConfigurationRecordFromResponse(
  configuration: DatasetConfigurationResponse,
): DatasetConfigurationRecord {
  return {
    id: configuration.id,
    knowledgeBaseId: configuration.knowledge_base_id,
    presetId: configuration.preset_id,
    status: configuration.status,
    version: configuration.version,
    values: cloneJsonObject(configuration.values) as DatasetConfigurationValues,
    latestSnapshotId: configuration.latest_snapshot_id,
    createdAt: configuration.created_at,
    updatedAt: configuration.updated_at,
    updatedBy: configuration.updated_by,
    metadata: cloneJsonObject(configuration.metadata),
  };
}

export function toKnowledgeBaseRecordFromResponse(
  response: KnowledgeBaseResponse,
  input: {
    datasetConfiguration: DatasetConfigurationRecord;
    systemPages: SystemPageRecord[];
    scope: ApiResourceScope;
  },
): KnowledgeBaseRecord {
  return {
    id: response.id,
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    name: response.name,
    slug: response.slug,
    ...(response.description === undefined ? {} : { description: response.description }),
    knowledgeBaseType: response.knowledge_base_type,
    upstreamKnowledgeBaseId: response.upstream_knowledge_base_id,
    upstreamBaseVersionId: response.upstream_base_version_id,
    upstreamSyncedVersionId: response.upstream_synced_version_id,
    forkOwner:
      response.fork_owner === null
        ? null
        : {
            ownerType: response.fork_owner.owner_type,
            externalOwnerId: response.fork_owner.external_owner_id,
            displayName: response.fork_owner.display_name,
          },
    syncStatus: response.sync_status,
    template: response.template,
    outputLanguage: response.output_language,
    status: response.status,
    currentVersionId: response.current_version_id,
    purpose: response.purpose,
    schema: cloneJsonObject(response.schema),
    retrieval: cloneJsonObject(response.retrieval),
    datasetConfiguration: input.datasetConfiguration,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    systemPages: input.systemPages,
  };
}
