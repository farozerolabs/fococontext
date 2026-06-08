import { Injectable } from "@nestjs/common";

import type { WikiDraftChangeSetRecord, WikiDraftRecord } from "./wiki-draft.types.js";

@Injectable()
export class WikiDraftRepository {
  private readonly drafts = new Map<string, WikiDraftRecord>();
  private readonly changeSets = new Map<string, WikiDraftChangeSetRecord>();

  createDraft(record: WikiDraftRecord): WikiDraftRecord {
    this.drafts.set(record.id, cloneDraft(record));

    return cloneDraft(record);
  }

  createChangeSet(record: WikiDraftChangeSetRecord): WikiDraftChangeSetRecord {
    this.changeSets.set(record.id, cloneChangeSet(record));

    return cloneChangeSet(record);
  }

  findDraftById(draftId: string): WikiDraftRecord | undefined {
    const record = this.drafts.get(draftId);

    return record === undefined ? undefined : cloneDraft(record);
  }
}

function cloneDraft(record: WikiDraftRecord): WikiDraftRecord {
  return {
    ...record,
    sources: record.sources.map((source) => ({ ...source })),
    tags: [...record.tags],
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
  };
}

function cloneChangeSet(record: WikiDraftChangeSetRecord): WikiDraftChangeSetRecord {
  return { ...record };
}
