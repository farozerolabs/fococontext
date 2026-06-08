import { useMutation, useQuery } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { Copy } from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router"

import {
  type KnowledgeBase,
  type RetrieveRequestInput,
  type RetrieveExpandRequestInput,
  type RetrieveExpandResponse,
  type RetrieveResolvedEvidenceOptions,
  type RetrieveResponse,
  type RetrievalDisplayMetadata,
  type SourceEvidenceBatchItemResult,
  type SourceEvidenceBatchResponse,
  type SourceEvidenceLocatorStatus,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js"
import { Checkbox } from "@/components/ui/checkbox.js"
import { Field, FieldLabel } from "@/components/ui/field.js"
import { Input } from "@/components/ui/input.js"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js"
import { Textarea } from "@/components/ui/textarea.js"
import { showToast } from "@/components/ui/toast.js"

export function KnowledgeBaseRetrievalPage() {
  const { knowledgeBaseId } = useParams()
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const [result, setResult] = useState<RetrieveResponse | null>(null)
  const [expandResult, setExpandResult] =
    useState<RetrieveExpandResponse | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState(
    () => knowledgeBaseId ?? ""
  )
  const [lastTargetId, setLastTargetId] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<RetrieveRequestInput | null>(
    null
  )
  const [lastContextBudgetTokens, setLastContextBudgetTokens] = useState(4000)
  const knowledgeBaseQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryFn: () =>
      knowledgeBaseId === undefined
        ? Promise.reject(
            new Error("Knowledge base route parameter is missing.")
          )
        : apiClient.getKnowledgeBase(knowledgeBaseId),
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.knowledgeBase("")
        : adminQueryKeys.knowledgeBase(knowledgeBaseId),
  })
  const canonicalKnowledgeBaseId =
    knowledgeBaseQuery.data?.knowledge_base_type === "fork"
      ? knowledgeBaseQuery.data.upstream_knowledge_base_id
      : knowledgeBaseId
  const forksQuery = useQuery({
    enabled: canonicalKnowledgeBaseId != null,
    queryFn: () =>
      canonicalKnowledgeBaseId == null
        ? Promise.resolve({ data: [], pagination: emptyPagination() })
        : apiClient.listKnowledgeBaseForks(canonicalKnowledgeBaseId, {
            page: 1,
            pageSize: 50,
          }),
    queryKey:
      canonicalKnowledgeBaseId == null
        ? adminQueryKeys.forks("")
        : adminQueryKeys.forks(canonicalKnowledgeBaseId, {
            page: 1,
            pageSize: 50,
          }),
  })
  const targetOptions = useMemo(
    () =>
      createTargetOptions({
        currentKnowledgeBase: knowledgeBaseQuery.data ?? null,
        forks: forksQuery.data?.data ?? [],
        routeKnowledgeBaseId: knowledgeBaseId,
        t,
      }),
    [forksQuery.data?.data, knowledgeBaseId, knowledgeBaseQuery.data, t]
  )
  const selectedTarget =
    targetOptions.find((option) => option.id === selectedTargetId) ??
    targetOptions[0] ??
    null

  useEffect(() => {
    if (knowledgeBaseId !== undefined) {
      setSelectedTargetId(knowledgeBaseId)
      setLastTargetId(null)
      setLastRequest(null)
      setResult(null)
      setExpandResult(null)
    }
  }, [knowledgeBaseId])

  const retrieveMutation = useMutation({
    mutationFn: ({
      input,
      targetId,
    }: {
      input: RetrieveRequestInput
      targetId: string
    }) => apiClient.retrieveKnowledgeContext(targetId, input),
    onSuccess: setResult,
  })
  const expandMutation = useMutation({
    mutationFn: ({
      input,
      targetId,
    }: {
      input: RetrieveExpandRequestInput
      targetId: string
    }) => apiClient.expandRetrievedGraphContext(targetId, input),
    onSuccess: setExpandResult,
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const query = String(formData.get("query") ?? "").trim()
    const mode = String(formData.get("mode") ?? "hybrid")
    const targetId = selectedTarget?.id ?? knowledgeBaseId
    const topK = readPositiveInteger(formData.get("top_k"), 5)
    const graphDepth = readNonNegativeInteger(formData.get("graph_depth"), 1)
    const graphLimit = readPositiveInteger(
      formData.get("graph_limit_per_result"),
      5
    )
    const contextBudgetTokens = readPositiveInteger(
      formData.get("context_budget_tokens"),
      4000
    )
    const relationTypes = readCsvInput(formData.get("relation_types"))
    const pageTypes = readCsvInput(formData.get("page_types"))
    const sourceIds = readCsvInput(formData.get("source_ids"))
    const versionId = String(formData.get("version_id") ?? "").trim()
    const includeResolvedEvidence = formData.has("include_resolved_evidence")
    const resolvedEvidenceOptions = readResolvedEvidenceOptions(formData)

    if (query.length === 0 || targetId === undefined) {
      return
    }

    const request: RetrieveRequestInput = {
      context_budget_tokens: contextBudgetTokens,
      graph_depth: graphDepth,
      graph_limit_per_result: graphLimit,
      include_context_pack: formData.has("include_context_pack"),
      include_expand_hints: formData.has("include_expand_hints"),
      include_graph: formData.has("include_graph"),
      include_trace: formData.has("include_trace"),
      mode: readRetrieveMode(mode),
      query,
      top_k: topK,
    }

    if (includeResolvedEvidence) {
      request.include_resolved_evidence = true

      if (resolvedEvidenceOptions !== undefined) {
        request.resolved_evidence = resolvedEvidenceOptions
      }
    }

    if (relationTypes.length > 0) {
      request.relation_types = relationTypes
    }

    if (pageTypes.length > 0) {
      request.page_types = pageTypes
    }

    if (sourceIds.length > 0) {
      request.source_ids = sourceIds
    }

    if (versionId.length > 0) {
      request.version_id = versionId
    }

    setLastTargetId(targetId)
    setLastRequest(request)
    setLastContextBudgetTokens(request.context_budget_tokens ?? 4000)
    setExpandResult(null)
    retrieveMutation.mutate({ input: request, targetId })
  }

  return (
    <div
      className="flex flex-col gap-6 p-6"
      data-route-id="knowledge-base-retrieval"
    >
      <h1 className="sr-only">{t("nav.retrievalLab")}</h1>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t("retrieval.queryPanel")}</CardTitle>
          <Button
            disabled={lastTargetId === null || lastRequest === null}
            onClick={() => {
              if (lastTargetId !== null && lastRequest !== null) {
                void navigator.clipboard.writeText(
                  JSON.stringify(
                    createRetrieveApiRequest(lastTargetId, lastRequest),
                    null,
                    2
                  )
                )
              }
            }}
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" data-icon="inline-start" />
            {t("retrieval.copyApiRequest")}
          </Button>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_8rem_8rem_8rem_10rem]"
            onSubmit={handleSubmit}
          >
            <Field>
              <FieldLabel htmlFor="retrieval-target-scope">
                {t("retrieval.targetScope")}
              </FieldLabel>
              <Select
                disabled={targetOptions.length === 0}
                name="target_scope"
                onValueChange={setSelectedTargetId}
                value={selectedTarget?.id ?? ""}
              >
                <SelectTrigger className="w-full" id="retrieval-target-scope">
                  <SelectValue
                    placeholder={
                      forksQuery.isLoading
                        ? t("retrieval.targetLoading")
                        : t("retrieval.targetUnavailable")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {targetOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-query">
                {t("retrieval.query")}
              </FieldLabel>
              <Textarea
                className="min-h-24"
                id="retrieval-query"
                name="query"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-mode">
                {t("retrieval.mode")}
              </FieldLabel>
              <Select defaultValue="hybrid" name="mode">
                <SelectTrigger className="w-full" id="retrieval-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="hybrid">
                      {t("retrieval.modeHybrid")}
                    </SelectItem>
                    <SelectItem value="keyword">
                      {t("retrieval.modeKeyword")}
                    </SelectItem>
                    <SelectItem value="semantic">
                      {t("retrieval.modeSemantic")}
                    </SelectItem>
                    <SelectItem value="graph">
                      {t("retrieval.modeGraph")}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-top-k">
                {t("retrieval.topK")}
              </FieldLabel>
              <Input
                defaultValue={5}
                id="retrieval-top-k"
                min={1}
                name="top_k"
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-graph-depth">
                {t("retrieval.graphDepth")}
              </FieldLabel>
              <Input
                defaultValue={1}
                id="retrieval-graph-depth"
                min={0}
                name="graph_depth"
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-graph-limit">
                {t("retrieval.graphLimit")}
              </FieldLabel>
              <Input
                defaultValue={5}
                id="retrieval-graph-limit"
                min={1}
                name="graph_limit_per_result"
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-context-budget">
                {t("retrieval.contextBudgetTokens")}
              </FieldLabel>
              <Input
                defaultValue={4000}
                id="retrieval-context-budget"
                min={1}
                name="context_budget_tokens"
                type="number"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-relation-types">
                {t("retrieval.relationTypes")}
              </FieldLabel>
              <Input
                id="retrieval-relation-types"
                name="relation_types"
                placeholder="wikilink, shared_source"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-page-types">
                {t("retrieval.pageTypes")}
              </FieldLabel>
              <Input
                id="retrieval-page-types"
                name="page_types"
                placeholder="source, concept"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-source-ids">
                {t("retrieval.sourceIds")}
              </FieldLabel>
              <Input
                id="retrieval-source-ids"
                name="source_ids"
                placeholder="doc_example"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="retrieval-version-id">
                {t("retrieval.versionId")}
              </FieldLabel>
              <Input
                id="retrieval-version-id"
                name="version_id"
                placeholder="kbv_example"
              />
            </Field>
            <div className="grid gap-3 md:col-span-2 xl:col-span-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <BooleanField
                  defaultChecked
                  id="retrieval-include-graph"
                  label={t("retrieval.includeGraph")}
                  name="include_graph"
                />
                <BooleanField
                  defaultChecked
                  id="retrieval-include-expand-hints"
                  label={t("retrieval.includeExpandHints")}
                  name="include_expand_hints"
                />
                <BooleanField
                  defaultChecked
                  id="retrieval-include-context-pack"
                  label={t("retrieval.includeContextPack")}
                  name="include_context_pack"
                />
                <BooleanField
                  defaultChecked
                  id="retrieval-include-trace"
                  label={t("retrieval.includeTrace")}
                  name="include_trace"
                />
                <BooleanField
                  id="retrieval-include-resolved-evidence"
                  label={t("retrieval.includeResolvedEvidence")}
                  name="include_resolved_evidence"
                />
              </div>
              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="text-sm font-medium sm:col-span-2 xl:col-span-4">
                  {t("retrieval.resolvedEvidenceOptions")}
                </div>
                <Field>
                  <FieldLabel htmlFor="retrieval-resolved-evidence-max-chars">
                    {t("retrieval.resolvedEvidenceMaxChars")}
                  </FieldLabel>
                  <Input
                    id="retrieval-resolved-evidence-max-chars"
                    min={1}
                    name="resolved_evidence_max_chars"
                    placeholder="1200"
                    type="number"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="retrieval-resolved-evidence-context-chars">
                    {t("retrieval.resolvedEvidenceContextChars")}
                  </FieldLabel>
                  <Input
                    id="retrieval-resolved-evidence-context-chars"
                    min={0}
                    name="resolved_evidence_context_chars"
                    placeholder="160"
                    type="number"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="retrieval-resolved-evidence-max-items">
                    {t("retrieval.resolvedEvidenceMaxItems")}
                  </FieldLabel>
                  <Input
                    id="retrieval-resolved-evidence-max-items"
                    min={1}
                    name="resolved_evidence_max_items"
                    placeholder="10"
                    type="number"
                  />
                </Field>
                <BooleanField
                  id="retrieval-resolved-evidence-allow-fallback"
                  label={t("retrieval.resolvedEvidenceAllowFallback")}
                  name="resolved_evidence_allow_fallback"
                />
              </div>
              <div className="flex items-end justify-end">
                <Button disabled={retrieveMutation.isPending} type="submit">
                  {t("action.runRetrieve")}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {retrieveMutation.isPending ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {retrieveMutation.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {result !== null && result.results.length === 0 ? (
        <EmptyState title={t("empty.noResults")} />
      ) : null}
      {result !== null && result.results.length > 0 ? (
        <RetrievalResultView
          expandResult={expandResult}
          expandStatus={{
            isPending: expandMutation.isPending,
            onExpand: (pageId) =>
              lastTargetId === null || lastRequest === null
                ? undefined
                : expandMutation.mutate({
                    input: createRetrieveExpandRequest({
                      contextBudgetTokens: lastContextBudgetTokens,
                      pageId,
                      retrieveRequest: lastRequest,
                    }),
                    targetId: lastTargetId,
                  }),
          }}
          result={result}
        />
      ) : null}
    </div>
  )
}

function readRetrieveMode(
  value: string
): NonNullable<RetrieveRequestInput["mode"]> {
  if (
    value === "hybrid" ||
    value === "keyword" ||
    value === "semantic" ||
    value === "graph"
  ) {
    return value
  }

  return "hybrid"
}

function createRetrieveApiRequest(
  knowledgeBaseId: string,
  body: RetrieveRequestInput
) {
  return {
    body,
    method: "POST",
    path: `/v1/knowledge-bases/${knowledgeBaseId}/retrieve`,
  }
}

interface RetrievalTargetOption {
  id: string
  label: string
  type: KnowledgeBase["knowledge_base_type"]
}

function createTargetOptions({
  currentKnowledgeBase,
  forks,
  routeKnowledgeBaseId,
  t,
}: {
  currentKnowledgeBase: KnowledgeBase | null
  forks: readonly KnowledgeBase[]
  routeKnowledgeBaseId: string | undefined
  t: TFunction
}): RetrievalTargetOption[] {
  const seen = new Set<string>()
  const options: RetrievalTargetOption[] = []
  const addOption = (option: RetrievalTargetOption) => {
    if (seen.has(option.id)) {
      return
    }

    seen.add(option.id)
    options.push(option)
  }

  if (currentKnowledgeBase === null && routeKnowledgeBaseId !== undefined) {
    addOption({
      id: routeKnowledgeBaseId,
      label: t("retrieval.targetCanonicalFallback", {
        id: routeKnowledgeBaseId,
      }),
      type: "canonical",
    })
  }

  if (currentKnowledgeBase?.knowledge_base_type === "canonical") {
    addOption({
      id: currentKnowledgeBase.id,
      label: t("retrieval.targetCanonical", {
        name: currentKnowledgeBase.name,
      }),
      type: "canonical",
    })
  }

  if (
    currentKnowledgeBase?.knowledge_base_type === "fork" &&
    currentKnowledgeBase.upstream_knowledge_base_id !== null
  ) {
    addOption({
      id: currentKnowledgeBase.upstream_knowledge_base_id,
      label: t("retrieval.targetCanonicalFallback", {
        id: currentKnowledgeBase.upstream_knowledge_base_id,
      }),
      type: "canonical",
    })
  }

  if (currentKnowledgeBase?.knowledge_base_type === "fork") {
    addOption({
      id: currentKnowledgeBase.id,
      label: t("retrieval.targetFork", {
        name: formatForkTargetName(currentKnowledgeBase),
      }),
      type: "fork",
    })
  }

  for (const fork of forks) {
    addOption({
      id: fork.id,
      label: t("retrieval.targetFork", {
        name: formatForkTargetName(fork),
      }),
      type: "fork",
    })
  }

  return options
}

function formatForkTargetName(fork: KnowledgeBase): string {
  return fork.fork_owner?.display_name ?? fork.name
}

function emptyPagination() {
  return {
    has_more: false,
    page: 1,
    page_size: 50,
    total: 0,
  }
}

function readPositiveInteger(
  value: FormDataEntryValue | null,
  fallback: number
) {
  const candidate = Number(value ?? fallback)

  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : fallback
}

function readNonNegativeInteger(
  value: FormDataEntryValue | null,
  fallback: number
) {
  const candidate = Number(value ?? fallback)

  return Number.isSafeInteger(candidate) && candidate >= 0
    ? candidate
    : fallback
}

function readCsvInput(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function readOptionalNonNegativeInteger(
  value: FormDataEntryValue | null
): number | undefined {
  const text = String(value ?? "").trim()

  if (text.length === 0) {
    return undefined
  }

  const candidate = Number(text)

  return Number.isSafeInteger(candidate) && candidate >= 0
    ? candidate
    : undefined
}

function readOptionalPositiveInteger(
  value: FormDataEntryValue | null
): number | undefined {
  const text = String(value ?? "").trim()

  if (text.length === 0) {
    return undefined
  }

  const candidate = Number(text)

  return Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : undefined
}

function readResolvedEvidenceOptions(
  formData: FormData
): RetrieveResolvedEvidenceOptions | undefined {
  const maxChars = readOptionalPositiveInteger(
    formData.get("resolved_evidence_max_chars")
  )
  const contextChars = readOptionalNonNegativeInteger(
    formData.get("resolved_evidence_context_chars")
  )
  const maxItems = readOptionalPositiveInteger(
    formData.get("resolved_evidence_max_items")
  )
  const allowFallback = formData.has("resolved_evidence_allow_fallback")
  const resolvedEvidence: RetrieveResolvedEvidenceOptions = {}

  if (maxChars !== undefined) {
    resolvedEvidence.max_chars = maxChars
  }

  if (contextChars !== undefined) {
    resolvedEvidence.context_chars = contextChars
  }

  if (maxItems !== undefined) {
    resolvedEvidence.max_items = maxItems
  }

  if (allowFallback) {
    resolvedEvidence.allow_fallback = true
  }

  return Object.keys(resolvedEvidence).length === 0
    ? undefined
    : resolvedEvidence
}

function createRetrieveExpandRequest({
  contextBudgetTokens,
  pageId,
  retrieveRequest,
}: {
  contextBudgetTokens: number
  pageId: string
  retrieveRequest: RetrieveRequestInput
}): RetrieveExpandRequestInput {
  const request: RetrieveExpandRequestInput = {
    context_budget_tokens: contextBudgetTokens,
    depth: 1,
    include_context_pack: true,
    seed_page_ids: [pageId],
  }

  if (retrieveRequest.include_resolved_evidence === true) {
    request.include_resolved_evidence = true
  }

  if (retrieveRequest.resolved_evidence !== undefined) {
    request.resolved_evidence = retrieveRequest.resolved_evidence
  }

  if (retrieveRequest.version_id !== undefined) {
    request.version_id = retrieveRequest.version_id
  }

  return request
}

function BooleanField({
  defaultChecked,
  id,
  label,
  name,
}: {
  defaultChecked?: boolean
  id: string
  label: string
  name:
    | "include_context_pack"
    | "include_expand_hints"
    | "include_graph"
    | "include_resolved_evidence"
    | "include_trace"
    | "resolved_evidence_allow_fallback"
}) {
  return (
    <label
      className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm"
      htmlFor={id}
    >
      <Checkbox
        {...(defaultChecked === undefined ? {} : { defaultChecked })}
        id={id}
        name={name}
      />
      <span>{label}</span>
    </label>
  )
}

function OpenApiField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <code className="text-xs text-muted-foreground">{label}</code>
      <span className="text-sm">{value}</span>
    </div>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function MetadataRows({ metadata }: { metadata: RetrievalDisplayMetadata }) {
  const { t } = useTranslation()
  const entries = Object.entries(metadata)

  if (entries.length === 0) {
    return (
      <div className="text-muted-foreground">
        {t("retrieval.metadataEmpty")}
      </div>
    )
  }

  return (
    <dl className="grid gap-1 rounded-md border p-2 text-xs">
      {entries.map(([key, value]) => (
        <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]" key={key}>
          <dt className="font-medium text-muted-foreground">{key}</dt>
          <dd className="break-words">{readDisplayValue(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function LocatorStatusBadge({ status }: { status: unknown }) {
  const { t } = useTranslation()
  const locatorStatus = readLocatorStatus(status)

  return (
    <Badge variant={getLocatorStatusBadgeVariant(locatorStatus)}>
      {t(getLocatorStatusLabelKey(locatorStatus))}
    </Badge>
  )
}

function ResolvedEvidenceView({
  evidence,
}: {
  evidence: SourceEvidenceBatchResponse | undefined
}) {
  const { t } = useTranslation()

  if (evidence === undefined) {
    return null
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{t("retrieval.resolvedEvidence")}</h3>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>
            {t("retrieval.resolvedEvidenceItems")}: {evidence.items.length}
          </span>
          <span>
            {t("retrieval.resolvedEvidenceText")}: {evidence.total_text_chars}
          </span>
          {evidence.truncated ? (
            <Badge variant="secondary">{t("retrieval.truncated")}</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {evidence.items.map((item) => (
          <ResolvedEvidenceItemView
            item={item}
            key={`${item.index}:${item.document_id}`}
          />
        ))}
      </div>
    </section>
  )
}

function ResolvedEvidenceItemView({
  item,
}: {
  item: SourceEvidenceBatchItemResult
}) {
  const { t } = useTranslation()
  const evidence = item.evidence

  return (
    <article className="flex flex-col gap-2 rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.status === "resolved" ? "default" : "destructive"}>
          {t("retrieval.resolvedEvidenceStatus")}: {item.status}
        </Badge>
        <ResourceIdDisplay resourceId={item.document_id} />
        {evidence === undefined ? null : (
          <LocatorStatusBadge status={evidence.locator_status} />
        )}
      </div>
      {item.error === undefined ? null : (
        <div className="rounded-md border border-destructive/40 p-2 text-xs text-destructive">
          {readDisplayValue(item.error.message ?? item.error.code)}
        </div>
      )}
      {evidence === undefined ? null : (
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <OpenApiField
              label={t("retrieval.resolvedEvidenceKind")}
              value={evidence.evidence_kind}
            />
            <OpenApiField
              label="locator"
              value={readDisplayValue(evidence.locator)}
            />
            <OpenApiField
              label="parsed_content_id"
              value={evidence.parsed_content_id}
            />
            <OpenApiField
              label="parser"
              value={`${evidence.parser_name}@${evidence.parser_version}`}
            />
          </div>
          {evidence.warnings.length === 0 ? null : (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium">
                {t("retrieval.resolvedEvidenceWarnings")}
              </div>
              <div className="flex flex-wrap gap-1">
                {evidence.warnings.map((warning) => (
                  <Badge key={warning.code} variant="secondary">
                    {warning.code}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {evidence.text.length === 0 ? null : (
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
              {evidence.text}
            </pre>
          )}
        </div>
      )}
    </article>
  )
}

function findTraceStageOutput(
  trace: RetrieveResponse["trace"],
  name: string
): Record<string, unknown> | null {
  return trace?.stages.find((stage) => stage.name === name)?.output ?? null
}

function readRecordField(
  value: Record<string, unknown> | null,
  field: string
): Record<string, unknown> | null {
  const candidate = value?.[field]

  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null
}

function readDisplayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "-"
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  return JSON.stringify(value)
}

function readLocatorStatus(value: unknown): SourceEvidenceLocatorStatus {
  if (
    value === "ambiguous" ||
    value === "not_found" ||
    value === "not_provided" ||
    value === "resolved" ||
    value === "unsupported"
  ) {
    return value
  }

  return "not_provided"
}

function getLocatorStatusBadgeVariant(
  status: SourceEvidenceLocatorStatus
): "default" | "destructive" | "outline" | "secondary" {
  if (status === "resolved") {
    return "default"
  }

  if (status === "ambiguous" || status === "not_found") {
    return "destructive"
  }

  return "secondary"
}

function getLocatorStatusLabelKey(status: SourceEvidenceLocatorStatus): string {
  switch (status) {
    case "ambiguous":
      return "retrieval.locatorAmbiguous"
    case "not_found":
      return "retrieval.locatorNotFound"
    case "not_provided":
      return "retrieval.locatorNotProvided"
    case "resolved":
      return "retrieval.locatorResolved"
    case "unsupported":
      return "retrieval.locatorUnsupported"
  }
}

function formatConfidenceBucket(confidence: number): string {
  if (confidence < 0.25) {
    return "lt_0_25"
  }

  if (confidence < 0.5) {
    return "0_25_0_5"
  }

  if (confidence < 0.75) {
    return "0_5_0_75"
  }

  return "gte_0_75"
}

function RetrievalResultView({
  expandResult,
  expandStatus,
  result,
}: {
  expandResult: RetrieveExpandResponse | null
  expandStatus: {
    isPending: boolean
    onExpand: (pageId: string) => void
  }
  result: RetrieveResponse
}) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const rankFusionOutput = findTraceStageOutput(result.trace, "rank_fusion")
  const rankFusionDiagnostics = readRecordField(rankFusionOutput, "diagnostics")
  const duplicateControl = readRecordField(
    rankFusionDiagnostics,
    "duplicate_control"
  )
  const rerankOutput = findTraceStageOutput(result.trace, "rerank")
  const contextPruningOutput = findTraceStageOutput(
    result.trace,
    "context_pruning"
  )
  const citationSelectionOutput = findTraceStageOutput(
    result.trace,
    "citation_selection"
  )
  const answerabilityOutput = findTraceStageOutput(
    result.trace,
    "answerability"
  )

  async function handleOpenMediaPreview(mediaAssetId: string) {
    try {
      const result = await apiClient.getMediaAssetPreview(mediaAssetId)
      const previewUrl = result.media_asset_preview.preview_url

      if (previewUrl === null) {
        showToast({ message: t("source.caption.previewUnavailable") })
        return
      }

      window.open(previewUrl, "_blank", "noopener,noreferrer")
    } catch {
      showToast({
        message: t("source.caption.previewFailed"),
        variant: "error",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold tracking-normal">
              {t("retrieval.responseMetadata")}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OpenApiField
            label="target_knowledge_base_type"
            value={result.target_knowledge_base_type}
          />
          <OpenApiField
            label={t("retrieval.answerabilityStatus")}
            value={result.answerability.status}
          />
          <OpenApiField
            label={t("retrieval.answerabilityConfidence")}
            value={`${Math.round(result.answerability.confidence * 100)}%`}
          />
          <OpenApiField
            label={t("retrieval.answerabilityConfidenceBucket")}
            value={formatConfidenceBucket(result.answerability.confidence)}
          />
          <OpenApiField
            label={t("retrieval.evidenceSufficiency")}
            value={result.answerability.evidence_sufficiency}
          />
          <OpenApiField
            label={t("retrieval.noAnswer")}
            value={String(result.answerability.no_answer)}
          />
          <OpenApiField
            label={t("retrieval.recommendedAction")}
            value={result.answerability.recommended_action}
          />
          <OpenApiField
            label={t("retrieval.reasonCodes")}
            value={result.answerability.reason_codes.join(", ")}
          />
          <OpenApiField
            label="visibility_summary"
            value={JSON.stringify(result.visibility_summary)}
          />
          {Object.entries(result.visibility_summary).map(([key, value]) => (
            <div className="flex flex-col gap-1" key={key}>
              <code className="text-xs text-muted-foreground">{key}</code>
              <Badge variant="outline">{value}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold tracking-normal">
              {t("retrieval.openapiResponse")}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="results">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="results">
                {t("retrieval.results")}
              </TabsTrigger>
              <TabsTrigger value="graph">
                {t("retrieval.graphExpansions")}
              </TabsTrigger>
              <TabsTrigger value="context">
                {t("retrieval.contextPack")}
              </TabsTrigger>
              <TabsTrigger value="trace">{t("retrieval.trace")}</TabsTrigger>
              <TabsTrigger value="citations">
                {t("retrieval.citations")}
              </TabsTrigger>
              <TabsTrigger value="api">{t("retrieval.apiDebug")}</TabsTrigger>
            </TabsList>
            <TabsContent value="results">
              <JsonBlock value={result.results} />
            </TabsContent>
            <TabsContent value="graph">
              <JsonBlock
                value={{
                  expandable_graph: result.expandable_graph,
                  graph_expansions: result.graph_expansions,
                }}
              />
            </TabsContent>
            <TabsContent value="context">
              <JsonBlock
                value={{
                  context_budget: result.context_budget,
                  context_pack: result.context_pack,
                }}
              />
            </TabsContent>
            <TabsContent value="trace">
              <JsonBlock
                value={{
                  trace: result.trace,
                  warnings: result.warnings,
                }}
              />
            </TabsContent>
            <TabsContent value="citations">
              <JsonBlock
                value={{
                  citations: result.citations,
                  media_evidence: result.media_evidence ?? [],
                }}
              />
            </TabsContent>
            <TabsContent value="api">
              <JsonBlock value={result} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <ResolvedEvidenceView evidence={result.resolved_evidence} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-semibold tracking-normal">
                {t("retrieval.results")}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result.results.map((item) => (
              <article
                className="flex flex-col gap-2 rounded-md border p-3"
                key={item.result_id}
              >
                <div className="font-medium">{item.title}</div>
                <div className="flex flex-wrap gap-2">
                  <ResourceIdDisplay resourceId={item.page_id} />
                  <ResourceIdDisplay resourceId={item.page_version_id} />
                </div>
                <div className="text-sm text-muted-foreground">
                  {item.retrieval_reason}
                </div>
                {item.display_metadata === undefined ? null : (
                  <section className="flex flex-col gap-1 text-sm">
                    <h3 className="font-medium">
                      {t("retrieval.displayMetadata")}
                    </h3>
                    <MetadataRows metadata={item.display_metadata} />
                  </section>
                )}
                {item.score_contribution === undefined ? null : (
                  <section className="flex flex-col gap-1 text-sm">
                    <h3 className="font-medium">
                      {t("retrieval.scoreContributions")}
                    </h3>
                    <pre className="max-h-28 overflow-auto rounded-md border bg-muted p-2 text-xs">
                      {JSON.stringify(item.score_contribution, null, 2)}
                    </pre>
                  </section>
                )}
                {item.citations.length === 0 ? null : (
                  <section className="flex flex-col gap-2 text-sm">
                    <h3 className="font-medium">
                      {t("retrieval.citationStatus")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {item.citations.map((citation, index) => (
                        <div
                          className="flex items-center gap-1"
                          key={`${String(citation["document_id"])}:${index}`}
                        >
                          <LocatorStatusBadge
                            status={citation["locator_status"]}
                          />
                          <span className="text-xs text-muted-foreground">
                            {readDisplayValue(citation["locator"])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <div className="text-sm">{item.section}</div>
                {(item.media_evidence ?? []).length > 0 ? (
                  <section className="flex flex-col gap-2 text-sm">
                    <div className="font-medium">
                      {t("retrieval.imageEvidence")}
                    </div>
                    {(item.media_evidence ?? []).map((evidence) => (
                      <div
                        className="flex flex-col gap-1 rounded-md border p-2"
                        key={evidence.media_asset_id}
                      >
                        <div className="flex flex-wrap gap-2">
                          <ResourceIdDisplay
                            resourceId={evidence.media_asset_id}
                          />
                          <ResourceIdDisplay
                            resourceId={evidence.document_id}
                          />
                        </div>
                        {evidence.caption === undefined ? null : (
                          <div className="text-muted-foreground">
                            {evidence.caption}
                          </div>
                        )}
                        <Button
                          disabled={!evidence.preview.available}
                          onClick={() =>
                            handleOpenMediaPreview(evidence.media_asset_id)
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("retrieval.imagePreview")}
                        </Button>
                      </div>
                    ))}
                  </section>
                ) : null}
                <Button
                  disabled={expandStatus.isPending}
                  onClick={() => expandStatus.onExpand(item.page_id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("retrieval.expand")}
                </Button>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-semibold tracking-normal">
                {t("retrieval.contextPack")}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.context_pack === null ? (
              <div className="text-sm text-muted-foreground">
                {t("retrieval.noContextPack")}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {t("retrieval.contextBudgetAllocation")}
                  </h3>
                  <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 text-xs">
                    {JSON.stringify(result.context_budget, null, 2)}
                  </pre>
                </section>
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {t("retrieval.omittedItems")}
                  </h3>
                  <pre className="max-h-32 overflow-auto rounded-md border bg-muted p-3 text-xs">
                    {JSON.stringify(
                      readContextBudgetArray(
                        result.context_budget,
                        "omitted_items"
                      ),
                      null,
                      2
                    )}
                  </pre>
                </section>
                <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {result.context_pack.content}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-semibold tracking-normal">
                {t("retrieval.trace")}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result.trace === null ? null : (
              <>
                <ResourceIdDisplay resourceId={result.trace.id} />
                <section className="flex flex-col gap-2 text-sm">
                  <h3 className="font-medium">{t("retrieval.traceSummary")}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <OpenApiField
                      label={t("retrieval.rerankStatus")}
                      value={readDisplayValue(rerankOutput?.["status"])}
                    />
                    <OpenApiField
                      label={t("retrieval.duplicatePruned")}
                      value={readDisplayValue(
                        duplicateControl?.["pruned_count"]
                      )}
                    />
                    <OpenApiField
                      label={t("retrieval.contextPruned")}
                      value={readDisplayValue(
                        contextPruningOutput?.["omitted_item_count"]
                      )}
                    />
                    <OpenApiField
                      label={t("retrieval.citationStatus")}
                      value={readDisplayValue(
                        citationSelectionOutput?.["citation_count"]
                      )}
                    />
                    <OpenApiField
                      label={t("retrieval.answerabilityStatus")}
                      value={readDisplayValue(answerabilityOutput?.["status"])}
                    />
                    <OpenApiField
                      label={t("retrieval.evidenceSufficiency")}
                      value={readDisplayValue(
                        answerabilityOutput?.["evidence_sufficiency"]
                      )}
                    />
                    <OpenApiField
                      label={t("retrieval.recommendedAction")}
                      value={readDisplayValue(
                        answerabilityOutput?.["recommended_action"]
                      )}
                    />
                  </div>
                </section>
                <section className="flex flex-col gap-1 text-sm">
                  <h3 className="font-medium">
                    {t("retrieval.traceWarnings")}
                  </h3>
                  <pre className="overflow-auto rounded-md border bg-muted p-2 text-xs">
                    {JSON.stringify(result.warnings, null, 2)}
                  </pre>
                </section>
                {result.trace.stages.map((stage) => (
                  <div
                    className="rounded-md border p-2 text-sm"
                    key={stage.name}
                  >
                    <div className="font-medium">{stage.name}</div>
                    <pre className="mt-1 overflow-auto text-xs">
                      {JSON.stringify(stage.output)}
                    </pre>
                  </div>
                ))}
              </>
            )}
            <section className="flex flex-col gap-1 text-sm">
              <h3 className="font-medium">{t("retrieval.apiRequest")}</h3>
              <pre className="overflow-auto rounded-md border bg-muted p-2 text-xs">
                {JSON.stringify(
                  { query: result.query, mode: result.mode },
                  null,
                  2
                )}
              </pre>
            </section>
          </CardContent>
        </Card>
      </div>
      {expandResult === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-semibold tracking-normal">
                {t("retrieval.expandResult")}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            <section className="flex flex-col gap-2 xl:col-span-2">
              <h3 className="text-sm font-medium">
                {t("retrieval.answerability")}
              </h3>
              <JsonBlock value={expandResult.answerability} />
            </section>
            <section className="flex flex-col gap-2 xl:col-span-2">
              <ResolvedEvidenceView evidence={expandResult.resolved_evidence} />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("retrieval.results")}</h3>
              <pre className="max-h-72 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {JSON.stringify(expandResult.expanded_results, null, 2)}
              </pre>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {t("retrieval.contextPackDelta")}
              </h3>
              {expandResult.context_pack_delta === null ? (
                <div className="text-sm text-muted-foreground">
                  {t("retrieval.noContextPack")}
                </div>
              ) : (
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {expandResult.context_pack_delta.content}
                </pre>
              )}
            </section>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function readContextBudgetArray(
  value: Record<string, unknown> | null,
  key: string
): readonly unknown[] {
  const candidate = value?.[key]

  return Array.isArray(candidate) ? candidate : []
}
