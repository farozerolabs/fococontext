import type {
  StructuredAnalysisItem,
  StructuredAnalysisOutput,
  StructuredAnalysisRelationship,
  StructuredGeneratedDraft,
  StructuredGenerationOutput,
  StructuredSourceRef,
} from "./structured-output.js";

export type SourceRefLocatorStatus =
  | "resolved"
  | "not_provided"
  | "not_found"
  | "ambiguous"
  | "unsupported";

export interface SourceRefLocatorValidationSummary {
  resolved: number;
  notProvided: number;
  notFound: number;
  unsupported: number;
  normalized: number;
  downgraded: number;
}

export interface SourceRefLocatorValidationResult {
  sourceRefs: StructuredSourceRef[];
  locatorRefs: string[];
  summary: SourceRefLocatorValidationSummary;
}

type ValidatedStructuredSourceRef = StructuredSourceRef & {
  locator_status: SourceRefLocatorStatus;
  warning_codes: string[];
};

const emptySummary: SourceRefLocatorValidationSummary = {
  resolved: 0,
  notProvided: 0,
  notFound: 0,
  unsupported: 0,
  normalized: 0,
  downgraded: 0,
};

export function validateAnalysisSourceRefs(
  output: StructuredAnalysisOutput,
  markdown: string,
): { output: StructuredAnalysisOutput; summary: SourceRefLocatorValidationSummary } {
  const summary = createSummary();

  return {
    output: {
      entities: output.entities.map((item) => validateAnalysisItem(item, markdown, summary)),
      concepts: output.concepts.map((item) => validateAnalysisItem(item, markdown, summary)),
      claims: output.claims.map((item) => validateAnalysisItem(item, markdown, summary)),
      contradictions: output.contradictions.map((item) =>
        validateAnalysisItem(item, markdown, summary),
      ),
      relationships: output.relationships.map((item) =>
        validateRelationship(item, markdown, summary),
      ),
    },
    summary,
  };
}

export function validateGenerationSourceRefs(
  output: StructuredGenerationOutput,
  markdown: string,
): { output: StructuredGenerationOutput; summary: SourceRefLocatorValidationSummary } {
  const summary = createSummary();

  return {
    output: {
      drafts: output.drafts.map((draft) => validateGeneratedDraft(draft, markdown, summary)),
    },
    summary,
  };
}

export function validateGenerationSourceRefsFromAnalysis(
  output: StructuredGenerationOutput,
  analysisSourceRefs: readonly Record<string, unknown>[],
): { output: StructuredGenerationOutput; summary: SourceRefLocatorValidationSummary } {
  const summary = createSummary();
  const validatedSourceRefs = analysisSourceRefs.flatMap(readValidatedSourceRef);

  return {
    output: {
      drafts: output.drafts.map((draft) =>
        validateGeneratedDraftAgainstKnownSourceRefs(draft, validatedSourceRefs, summary),
      ),
    },
    summary,
  };
}

export function validatePersistedSourceRefs(sourceRefs: readonly Record<string, unknown>[]): {
  sourceRefs: StructuredSourceRef[];
  summary: SourceRefLocatorValidationSummary;
} {
  const summary = createSummary();
  const nextSourceRefs = sourceRefs.flatMap((sourceRef) =>
    validatePersistedSourceRef(sourceRef, summary),
  );

  return {
    sourceRefs: nextSourceRefs,
    summary,
  };
}

export function validateSourceRefs(
  sourceRefs: readonly StructuredSourceRef[],
  locatorRefs: readonly string[],
  markdown: string,
): SourceRefLocatorValidationResult {
  const summary = createSummary();
  const nextSourceRefs = sourceRefs.map((sourceRef) =>
    validateSourceRef(sourceRef, markdown, summary),
  );
  const nextLocatorRefs = [
    ...new Set(
      [
        ...locatorRefs,
        ...nextSourceRefs
          .filter((sourceRef) => sourceRef.locator_status === "resolved")
          .map((sourceRef) => sourceRef.locator)
          .filter(
            (locator): locator is string => typeof locator === "string" && locator.length > 0,
          ),
      ].filter((locator) => locator.length > 0),
    ),
  ];

  return {
    sourceRefs: nextSourceRefs,
    locatorRefs: nextLocatorRefs,
    summary,
  };
}

export function summarizeSourceRefLocatorValidation(
  summaries: readonly SourceRefLocatorValidationSummary[],
): SourceRefLocatorValidationSummary {
  const summary = createSummary();

  for (const item of summaries) {
    summary.resolved += item.resolved;
    summary.notProvided += item.notProvided;
    summary.notFound += item.notFound;
    summary.unsupported += item.unsupported;
    summary.normalized += item.normalized;
    summary.downgraded += item.downgraded;
  }

  return summary;
}

export function sourceRefLocatorSummaryToMetadata(summary: SourceRefLocatorValidationSummary) {
  return {
    resolved: summary.resolved,
    not_provided: summary.notProvided,
    not_found: summary.notFound,
    unsupported: summary.unsupported,
    normalized: summary.normalized,
    downgraded: summary.downgraded,
  };
}

function validateAnalysisItem(
  item: StructuredAnalysisItem,
  markdown: string,
  summary: SourceRefLocatorValidationSummary,
): StructuredAnalysisItem {
  const result = validateSourceRefs(item.source_refs, item.locator_refs, markdown);
  mergeSummary(summary, result.summary);

  return {
    ...item,
    source_refs: result.sourceRefs,
    locator_refs: result.locatorRefs,
  };
}

function validateRelationship(
  item: StructuredAnalysisRelationship,
  markdown: string,
  summary: SourceRefLocatorValidationSummary,
): StructuredAnalysisRelationship {
  const result = validateSourceRefs(item.source_refs, item.locator_refs, markdown);
  mergeSummary(summary, result.summary);

  return {
    ...item,
    source_refs: result.sourceRefs,
    locator_refs: result.locatorRefs,
  };
}

function validateGeneratedDraft(
  draft: StructuredGeneratedDraft,
  markdown: string,
  summary: SourceRefLocatorValidationSummary,
): StructuredGeneratedDraft {
  const result = validateSourceRefs(draft.source_refs, draft.locator_refs, markdown);
  mergeSummary(summary, result.summary);

  return {
    ...draft,
    source_refs: result.sourceRefs,
    locator_refs: result.locatorRefs,
  };
}

function validateGeneratedDraftAgainstKnownSourceRefs(
  draft: StructuredGeneratedDraft,
  knownSourceRefs: readonly ValidatedStructuredSourceRef[],
  summary: SourceRefLocatorValidationSummary,
): StructuredGeneratedDraft {
  const nextSourceRefs = draft.source_refs.map((sourceRef) =>
    validateSourceRefAgainstKnownRefs(sourceRef, knownSourceRefs, summary),
  );
  const locatorRefs = [
    ...new Set(
      [
        ...draft.locator_refs,
        ...nextSourceRefs
          .filter((sourceRef) => sourceRef.locator_status === "resolved")
          .map((sourceRef) => sourceRef.locator)
          .filter(
            (locator): locator is string => typeof locator === "string" && locator.length > 0,
          ),
      ].filter((locator) => locator.length > 0),
    ),
  ];

  return {
    ...draft,
    source_refs: nextSourceRefs,
    locator_refs: locatorRefs,
  };
}

function validateSourceRefAgainstKnownRefs(
  sourceRef: StructuredSourceRef,
  knownSourceRefs: readonly ValidatedStructuredSourceRef[],
  summary: SourceRefLocatorValidationSummary,
): StructuredSourceRef {
  const known = knownSourceRefs.find((candidate) => sourceRefsMatch(candidate, sourceRef));

  if (known !== undefined) {
    summary.resolved += known.locator_status === "resolved" ? 1 : 0;
    summary.notProvided += known.locator_status === "not_provided" ? 1 : 0;
    summary.notFound += known.locator_status === "not_found" ? 1 : 0;
    summary.unsupported += known.locator_status === "unsupported" ? 1 : 0;

    return {
      ...sourceRef,
      ...(known.parsed_content_id === undefined
        ? {}
        : { parsed_content_id: known.parsed_content_id }),
      ...(known.source_anchor_id === undefined ? {} : { source_anchor_id: known.source_anchor_id }),
      ...(known.locator === undefined ? {} : { locator: known.locator }),
      ...(known.media_asset_id === undefined ? {} : { media_asset_id: known.media_asset_id }),
      ...(known.evidence_kind === undefined ? {} : { evidence_kind: known.evidence_kind }),
      locator_status: known.locator_status,
      warning_codes: [...(known.warning_codes ?? [])],
    };
  }

  summary.notFound += 1;
  summary.downgraded += 1;

  return addWarning(
    {
      ...sourceRef,
      locator_status: "not_found",
    },
    "source_ref_locator_not_in_analysis",
  );
}

function validateSourceRef(
  sourceRef: StructuredSourceRef,
  markdown: string,
  summary: SourceRefLocatorValidationSummary,
): StructuredSourceRef {
  const evidenceKind = sourceRef.evidence_kind ?? "text";

  if (evidenceKind === "image_caption") {
    return validateImageCaptionSourceRef(sourceRef, summary);
  }

  if (evidenceKind === "ocr") {
    return validateOcrSourceRef(sourceRef, summary);
  }

  return validateTextSourceRef(sourceRef, markdown, summary);
}

function readValidatedSourceRef(value: Record<string, unknown>): ValidatedStructuredSourceRef[] {
  const documentId = readString(value.document_id);
  const locatorStatus = readLocatorStatus(value.locator_status);
  const parsedContentId = readString(value.parsed_content_id);
  const sourceAnchorId = readString(value.source_anchor_id);
  const locator = readString(value.locator);
  const mediaAssetId = readString(value.media_asset_id);
  const evidenceKind = readEvidenceKind(value.evidence_kind);

  if (documentId === null || locatorStatus === null) {
    return [];
  }

  return [
    {
      document_id: documentId,
      ...(parsedContentId === null ? {} : { parsed_content_id: parsedContentId }),
      ...(sourceAnchorId === null ? {} : { source_anchor_id: sourceAnchorId }),
      ...(locator === null ? {} : { locator }),
      ...(mediaAssetId === null ? {} : { media_asset_id: mediaAssetId }),
      ...(evidenceKind === null ? {} : { evidence_kind: evidenceKind }),
      locator_status: locatorStatus,
      warning_codes: readStringArray(value.warning_codes),
    },
  ];
}

function validatePersistedSourceRef(
  value: Record<string, unknown>,
  summary: SourceRefLocatorValidationSummary,
): StructuredSourceRef[] {
  const documentId = readString(value.document_id);

  if (documentId === null) {
    summary.unsupported += 1;
    summary.downgraded += 1;

    return [];
  }

  const locatorStatus = readLocatorStatus(value.locator_status);
  const parsedContentId = readString(value.parsed_content_id);
  const sourceAnchorId = readString(value.source_anchor_id);
  const locator = readString(value.locator);
  const mediaAssetId = readString(value.media_asset_id);
  const evidenceKind = readEvidenceKind(value.evidence_kind);
  const sourceRef: StructuredSourceRef = {
    document_id: documentId,
    ...(parsedContentId === null ? {} : { parsed_content_id: parsedContentId }),
    ...(sourceAnchorId === null ? {} : { source_anchor_id: sourceAnchorId }),
    ...(locator === null ? {} : { locator }),
    ...(mediaAssetId === null ? {} : { media_asset_id: mediaAssetId }),
    ...(evidenceKind === null ? {} : { evidence_kind: evidenceKind }),
  };

  if (locatorStatus !== null) {
    incrementStatusSummary(summary, locatorStatus);

    return [
      {
        ...sourceRef,
        locator_status: locatorStatus,
        warning_codes: readStringArray(value.warning_codes),
      },
    ];
  }

  summary.downgraded += 1;

  if (locator === null) {
    summary.notProvided += 1;

    return [
      addWarning(
        {
          ...sourceRef,
          locator_status: "not_provided",
        },
        "source_ref_locator_status_missing",
      ),
    ];
  }

  summary.notFound += 1;

  return [
    addWarning(
      {
        ...sourceRef,
        locator_status: "not_found",
      },
      "source_ref_locator_status_missing",
    ),
  ];
}

function sourceRefsMatch(left: StructuredSourceRef, right: StructuredSourceRef): boolean {
  return (
    left.document_id === right.document_id &&
    (right.locator === undefined || left.locator === right.locator) &&
    (right.media_asset_id === undefined || left.media_asset_id === right.media_asset_id) &&
    (right.evidence_kind === undefined || left.evidence_kind === right.evidence_kind)
  );
}

function incrementStatusSummary(
  summary: SourceRefLocatorValidationSummary,
  locatorStatus: SourceRefLocatorStatus,
): void {
  summary.resolved += locatorStatus === "resolved" ? 1 : 0;
  summary.notProvided += locatorStatus === "not_provided" ? 1 : 0;
  summary.notFound += locatorStatus === "not_found" ? 1 : 0;
  summary.unsupported += locatorStatus === "unsupported" ? 1 : 0;
}

function validateImageCaptionSourceRef(
  sourceRef: StructuredSourceRef,
  summary: SourceRefLocatorValidationSummary,
): StructuredSourceRef {
  if (sourceRef.media_asset_id !== undefined && sourceRef.media_asset_id.length > 0) {
    summary.resolved += 1;

    return {
      ...sourceRef,
      locator: sourceRef.locator ?? `image:${sourceRef.media_asset_id}`,
      locator_status: "resolved",
      warning_codes: removeWarning(sourceRef.warning_codes, "source_ref_locator_not_found"),
    };
  }

  summary.notFound += 1;
  summary.downgraded += 1;

  return addWarning(
    {
      ...sourceRef,
      locator_status: "not_found",
    },
    "source_ref_media_asset_missing",
  );
}

function validateOcrSourceRef(
  sourceRef: StructuredSourceRef,
  summary: SourceRefLocatorValidationSummary,
): StructuredSourceRef {
  if (sourceRef.locator !== undefined && isSupportedOcrLocator(sourceRef.locator)) {
    summary.resolved += 1;

    return {
      ...sourceRef,
      locator_status: "resolved",
      warning_codes: removeWarning(sourceRef.warning_codes, "source_ref_locator_not_found"),
    };
  }

  if (sourceRef.locator === undefined) {
    summary.notProvided += 1;
  } else {
    summary.notFound += 1;
  }
  summary.downgraded += 1;

  return addWarning(
    {
      ...sourceRef,
      locator_status: sourceRef.locator === undefined ? "not_provided" : "not_found",
    },
    sourceRef.locator === undefined
      ? "source_ref_locator_not_provided"
      : "source_ref_ocr_locator_not_found",
  );
}

function validateTextSourceRef(
  sourceRef: StructuredSourceRef,
  markdown: string,
  summary: SourceRefLocatorValidationSummary,
): StructuredSourceRef {
  const locator = sourceRef.locator?.trim();

  if (locator === undefined || locator.length === 0 || locator === "source_markdown") {
    summary.notProvided += 1;

    return addWarning(
      {
        ...sourceRef,
        ...(locator === undefined || locator.length === 0 ? {} : { locator }),
        locator_status: "not_provided",
      },
      "source_ref_locator_not_specific",
    );
  }

  const lineRange = resolveLineLocator(markdown, locator) ?? resolvePageLocator(markdown, locator);

  if (lineRange !== null) {
    summary.resolved += 1;

    return {
      ...sourceRef,
      locator,
      locator_status: "resolved",
      warning_codes: removeWarning(sourceRef.warning_codes, "source_ref_locator_not_found"),
    };
  }

  const textRange = resolveTextAnchor(markdown, locator);

  if (textRange !== null) {
    const normalizedLocator = createSourceMarkdownLocator(textRange);
    summary.resolved += 1;
    summary.normalized += normalizedLocator === locator ? 0 : 1;

    return {
      ...sourceRef,
      locator: normalizedLocator,
      locator_status: "resolved",
      warning_codes: removeWarning(sourceRef.warning_codes, "source_ref_locator_not_found"),
    };
  }

  summary.notFound += 1;
  summary.downgraded += 1;

  return addWarning(
    {
      ...sourceRef,
      locator,
      locator_status: "not_found",
    },
    "source_ref_locator_not_found",
  );
}

function resolveLineLocator(
  markdown: string,
  locator: string,
): { startLine: number; endLine: number } | null {
  const match = /^(?:source_markdown:|line:)(\d+)(?:-(\d+))?$/u.exec(locator);

  if (match === null) {
    return null;
  }

  const startLine = Number(match[1]);
  const endLine = match[2] === undefined ? startLine : Number(match[2]);
  const lines = markdown.split("\n");

  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine <= 0 ||
    endLine < startLine ||
    startLine > lines.length
  ) {
    return null;
  }

  const boundedEndLine = Math.min(endLine, lines.length);
  const text = lines.slice(startLine - 1, boundedEndLine).join("\n");

  return text.trim().length === 0
    ? null
    : {
        startLine,
        endLine: boundedEndLine,
      };
}

function resolvePageLocator(
  markdown: string,
  locator: string,
): { startLine: number; endLine: number } | null {
  const match = /^page:(\d+)$/u.exec(locator);

  if (match === null) {
    return null;
  }

  const pageNumber = match[1];
  const lines = markdown.split("\n");
  const startIndex = lines.findIndex((line) => {
    const normalized = line.trim().replace(/\s+/gu, " ");

    return (
      normalized === `## Page ${pageNumber}` ||
      normalized === `# Page ${pageNumber}` ||
      normalized === `Page ${pageNumber}`
    );
  });

  if (startIndex < 0) {
    return null;
  }

  let endIndex = lines.length - 1;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s+Page\s+\d+\s*$/u.test(lines[index]?.trim() ?? "")) {
      endIndex = index - 1;
      break;
    }
  }

  return {
    startLine: startIndex + 1,
    endLine: Math.max(startIndex + 1, endIndex + 1),
  };
}

function resolveTextAnchor(
  markdown: string,
  locator: string,
): { startLine: number; endLine: number } | null {
  if (locator.includes(",")) {
    return resolveCompoundTextAnchor(markdown, locator);
  }

  return findTextLineRange(markdown, locator);
}

function resolveCompoundTextAnchor(
  markdown: string,
  locator: string,
): { startLine: number; endLine: number } | null {
  const anchors = locator
    .split(",")
    .map((anchor) => anchor.trim())
    .filter((anchor) => anchor.length > 0);

  if (anchors.length < 2) {
    return null;
  }

  const ranges = anchors.map((anchor) => findTextLineRange(markdown, anchor));

  if (ranges.some((range) => range === null)) {
    return null;
  }

  return {
    startLine: Math.min(...ranges.map((range) => range?.startLine ?? Number.MAX_SAFE_INTEGER)),
    endLine: Math.max(...ranges.map((range) => range?.endLine ?? 0)),
  };
}

function findTextLineRange(
  markdown: string,
  text: string,
): { startLine: number; endLine: number } | null {
  const start = markdown.indexOf(text);

  if (start < 0) {
    return null;
  }

  const end = start + text.length;

  return {
    startLine: lineNumberAt(markdown, start),
    endLine: lineNumberAt(markdown, Math.max(start, end - 1)),
  };
}

function lineNumberAt(text: string, index: number): number {
  let lineNumber = 1;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === "\n") {
      lineNumber += 1;
    }
  }

  return lineNumber;
}

function createSourceMarkdownLocator(range: { startLine: number; endLine: number }): string {
  return range.startLine === range.endLine
    ? `source_markdown:${range.startLine}`
    : `source_markdown:${range.startLine}-${range.endLine}`;
}

function isSupportedOcrLocator(locator: string): boolean {
  return (
    /^ocr:page:\d+:block:\d+(?:-\d+)?$/u.test(locator) ||
    /^page:\d+(?:;block:\d+(?:-\d+)?)?$/u.test(locator) ||
    /^page:\d+:\d+(?:-\d+)?$/u.test(locator) ||
    /^page=\d+;\s*block_index=\d+$/u.test(locator) ||
    /^page=\d+:block=\d+(?:-\d+)?$/u.test(locator)
  );
}

function addWarning(sourceRef: StructuredSourceRef, warningCode: string): StructuredSourceRef {
  return {
    ...sourceRef,
    warning_codes: [...new Set([...(sourceRef.warning_codes ?? []), warningCode])],
  };
}

function removeWarning(warningCodes: readonly string[] | undefined, warningCode: string): string[] {
  const next = (warningCodes ?? []).filter((code) => code !== warningCode);

  return next;
}

function createSummary(): SourceRefLocatorValidationSummary {
  return { ...emptySummary };
}

function mergeSummary(
  target: SourceRefLocatorValidationSummary,
  source: SourceRefLocatorValidationSummary,
): void {
  target.resolved += source.resolved;
  target.notProvided += source.notProvided;
  target.notFound += source.notFound;
  target.unsupported += source.unsupported;
  target.normalized += source.normalized;
  target.downgraded += source.downgraded;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readEvidenceKind(value: unknown): "text" | "image_caption" | "ocr" | null {
  return value === "text" || value === "image_caption" || value === "ocr" ? value : null;
}

function readLocatorStatus(value: unknown): SourceRefLocatorStatus | null {
  return value === "resolved" ||
    value === "not_provided" ||
    value === "not_found" ||
    value === "ambiguous" ||
    value === "unsupported"
    ? value
    : null;
}
