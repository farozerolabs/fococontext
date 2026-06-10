import { Injectable } from "@nestjs/common";

import type { KnowledgeCheckRecord } from "./knowledge-check.types.js";

@Injectable()
export class KnowledgeCheckRepository {
  private readonly checks = new Map<string, KnowledgeCheckRecord>();

  create(record: KnowledgeCheckRecord): KnowledgeCheckRecord {
    this.checks.set(record.id, cloneCheck(record));

    return cloneCheck(record);
  }

  replaceAll(records: readonly KnowledgeCheckRecord[]): void {
    this.checks.clear();

    for (const record of records) {
      this.checks.set(record.id, cloneCheck(record));
    }
  }

  findById(checkId: string): KnowledgeCheckRecord | undefined {
    const record = this.checks.get(checkId);

    return record === undefined ? undefined : cloneCheck(record);
  }
}

function cloneCheck(record: KnowledgeCheckRecord): KnowledgeCheckRecord {
  return {
    ...record,
    checks: [...record.checks],
    configurationSnapshot: JSON.parse(JSON.stringify(record.configurationSnapshot)) as Record<
      string,
      unknown
    >,
    pageIds: [...record.pageIds],
    sourceDocumentIds: [...record.sourceDocumentIds],
    findings: JSON.parse(JSON.stringify(record.findings)) as KnowledgeCheckRecord["findings"],
    semanticRun: JSON.parse(
      JSON.stringify(record.semanticRun),
    ) as KnowledgeCheckRecord["semanticRun"],
  };
}
