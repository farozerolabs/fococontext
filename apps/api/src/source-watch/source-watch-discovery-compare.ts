import type { SourceDocumentRecord } from "../documents/document.types.js";
import type {
  SourceWatchDiscoveredSource,
  SourceWatchRuleRecord,
  SourceWatchScanDiscovery,
} from "./source-watch.types.js";

export function compareDiscoveredSources(
  rule: SourceWatchRuleRecord,
  existingSources: readonly SourceDocumentRecord[],
  scannedSources: readonly SourceWatchDiscoveredSource[],
): {
  changedSources: SourceWatchDiscoveredSource[];
  deleteCandidates: SourceWatchScanDiscovery["deleteCandidates"];
  newSources: SourceWatchDiscoveredSource[];
} {
  const existingByPath = groupDocumentsBySourcePath(existingSources);
  const scannedPaths = new Set(scannedSources.map((source) => source.source_path ?? source.name));
  const newSources: SourceWatchDiscoveredSource[] = [];
  const changedSources: SourceWatchDiscoveredSource[] = [];

  for (const source of scannedSources) {
    const sourcePath = source.source_path ?? source.name;
    const existing = existingByPath.get(sourcePath) ?? [];

    if (existing.length === 0) {
      newSources.push(source);
      continue;
    }

    if (
      !existing.some(
        (document) =>
          documentMatchesSourceFingerprint(document, source) ||
          document.contentHash === source.content_hash,
      )
    ) {
      changedSources.push(source);
    }
  }

  return {
    changedSources,
    deleteCandidates: createDeleteCandidates(rule, existingByPath, scannedPaths),
    newSources,
  };
}

export function groupDocumentsBySourcePath(
  documents: readonly SourceDocumentRecord[],
): Map<string, SourceDocumentRecord[]> {
  const grouped = new Map<string, SourceDocumentRecord[]>();

  for (const document of documents) {
    if (document.sourcePath === undefined) {
      continue;
    }

    grouped.set(document.sourcePath, [...(grouped.get(document.sourcePath) ?? []), document]);
  }

  for (const [sourcePath, items] of grouped.entries()) {
    grouped.set(
      sourcePath,
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  return grouped;
}

export function hasMatchingS3Fingerprint(
  documents: readonly SourceDocumentRecord[],
  fingerprint: string,
): boolean {
  return documents.some((document) => document.metadata.source_watch_fingerprint === fingerprint);
}

function createDeleteCandidates(
  rule: SourceWatchRuleRecord,
  existingByPath: ReadonlyMap<string, readonly SourceDocumentRecord[]>,
  scannedPaths: ReadonlySet<string>,
): SourceWatchScanDiscovery["deleteCandidates"] {
  return [...existingByPath.entries()]
    .filter(([sourcePath]) => !scannedPaths.has(sourcePath))
    .flatMap(([sourcePath, documents]) => {
      const latestDocument = documents[0];

      if (latestDocument === undefined) {
        return [];
      }

      return [
        {
          document_id: latestDocument.id,
          source_path: sourcePath,
          reason: "missing_from_source",
          metadata: {
            source_watch_rule_id: rule.id,
            source_watch_source_kind: rule.sourceKind,
          },
        },
      ];
    });
}

function documentMatchesSourceFingerprint(
  document: SourceDocumentRecord,
  source: SourceWatchDiscoveredSource,
): boolean {
  const sourceFingerprint = source.metadata?.source_watch_fingerprint;

  return (
    typeof sourceFingerprint === "string" &&
    document.metadata.source_watch_fingerprint === sourceFingerprint
  );
}
