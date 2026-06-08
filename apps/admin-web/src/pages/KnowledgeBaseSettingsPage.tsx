import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router"

import {
  type DatasetConfiguration,
  type DatasetOcrPolicy,
  type DatasetPromptTemplateValue,
  type DatasetPromptTemplateValues,
  type DatasetConfigurationPreset,
  type DatasetConfigurationValues,
  type Job,
  type KnowledgeBase,
  type KnowledgeBaseOutputLanguage,
  type KnowledgeBaseTemplate,
  type PromptPurpose,
  type PromptTemplateMode,
  type UpdateDatasetConfigurationInput,
  type UpdateKnowledgeBaseInput,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import {
  IdeDetailPanel,
  IdeExplorer,
  IdeExplorerGroup,
  IdeExplorerItem,
  IdeWorkspace,
} from "@/components/ide/IdeWorkspace.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { DangerousAction } from "@/components/state/DangerousAction.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Button } from "@/components/ui/button.js"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.js"
import { Input } from "@/components/ui/input.js"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js"
import { Textarea } from "@/components/ui/textarea.js"
import { showToast } from "@/components/ui/toast.js"

type KnowledgeBaseSettingsSection =
  | "dangerZone"
  | "datasetPreset"
  | "general"
  | "knowledgeCheck"
  | "markdownContract"
  | "models"
  | "ocrPolicy"
  | "promptTemplates"
  | "purpose"
  | "retrieval"
  | "schema"
  | "sourceLifecycle"
  | "sourceWatch"

type DatasetJsonSection =
  | "knowledge_check"
  | "markdown_contract"
  | "retrieval"
  | "schema"
  | "source_lifecycle"
  | "source_watch"

const promptPurposes: PromptPurpose[] = [
  "analysis",
  "generation",
  "merge",
  "vision_caption",
  "knowledge_check",
  "wiki_draft",
]

const analysisOutputShape =
  '{"entities":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"concepts":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"claims":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"contradictions":[{"title":"string","summary":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"metadata":{}}],"relationships":[{"from_title":"string","to_title":"string","relation_type":"wikilink or shared_source or type_affinity","evidence":"string or null","source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"]}]}'

const analysisOutputContract = [
  "Analysis contract: return only a strict JSON object with top-level arrays entities, concepts, claims, contradictions, and relationships.",
  "The exact canonical shape is:",
  analysisOutputShape,
  "Every entities, concepts, claims, and contradictions item must include title, summary, source_refs, locator_refs, and metadata.",
  "Every relationships item must include from_title, to_title, relation_type, evidence, source_refs, and locator_refs.",
  "Each top-level key must be an array. Use empty arrays when a category has no valid items. Do not return arrays of strings.",
  "Do not wrap the object in data, result, response, analysis, Markdown fences, prose, or any other envelope.",
].join(" ")

const generationDraftOutputShape =
  '{"drafts":[{"title":"string","page_type":"source or concept","markdown":"string","frontmatter":{},"source_refs":[{"document_id":"string","locator":"string","media_asset_id":"string or null","evidence_kind":"text or image_caption or ocr"}],"locator_refs":["string"],"relationship_candidates":[],"confidence":0.9}]}'

const generationDraftOutputContract = [
  "Generation contract: return only a strict JSON object with a top-level non-empty drafts array.",
  "The exact canonical shape is:",
  generationDraftOutputShape,
  "Every draft item must include title, page_type, markdown, frontmatter, source_refs, locator_refs, relationship_candidates, and confidence.",
  "Each source-backed draft must use source_refs or locator_refs from the validated analysis result.",
  "Do not wrap the object in data, result, response, analysis, Markdown fences, prose, or any other envelope.",
].join(" ")

const builtInPromptTextByPurpose: Record<PromptPurpose, string> = {
  analysis:
    "Analyze source content into source-traceable entities, concepts, claims, contradictions, and relationships.",
  generation:
    "Generate source-traceable Wiki Draft candidates from structured analysis results.",
  merge:
    "Merge a Wiki Draft into an existing page while preserving page identity and source traceability.",
  vision_caption:
    "Describe visible image content factually for source-grounded Wiki compilation without speculation.",
  knowledge_check:
    "Check Wiki quality for orphan pages, broken links, missing pages, missing sources, duplicates, and contradictions.",
  wiki_draft:
    "Compile externally confirmed knowledge notes into schema-compatible Wiki change candidates.",
}

export function KnowledgeBaseSettingsPage() {
  const { knowledgeBaseId } = useParams()
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [generalForm, setGeneralForm] = useState({
    name: "",
    description: "",
    outputLanguage: "auto" as KnowledgeBaseOutputLanguage,
  })
  const [purpose, setPurpose] = useState("")
  const [schemaText, setSchemaText] = useState("{}")
  const [retrievalText, setRetrievalText] = useState("{}")
  const [datasetPresetId, setDatasetPresetId] =
    useState<KnowledgeBaseTemplate>("general")
  const [markdownContractText, setMarkdownContractText] = useState("{}")
  const [sourceLifecycleText, setSourceLifecycleText] = useState("{}")
  const [knowledgeCheckText, setKnowledgeCheckText] = useState("{}")
  const [sourceWatchText, setSourceWatchText] = useState("{}")
  const [promptTemplates, setPromptTemplates] =
    useState<DatasetPromptTemplateValues>(() => createDefaultPromptTemplates())
  const [selectedPromptPurpose, setSelectedPromptPurpose] =
    useState<PromptPurpose>("analysis")
  const [promptTemplateError, setPromptTemplateError] = useState<string | null>(
    null
  )
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [retrievalError, setRetrievalError] = useState<string | null>(null)
  const [markdownContractError, setMarkdownContractError] = useState<
    string | null
  >(null)
  const [sourceLifecycleError, setSourceLifecycleError] = useState<
    string | null
  >(null)
  const [knowledgeCheckError, setKnowledgeCheckError] = useState<string | null>(
    null
  )
  const [sourceWatchError, setSourceWatchError] = useState<string | null>(null)
  const [contractStatus, setContractStatus] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reindexDialogOpen, setReindexDialogOpen] = useState(false)
  const [lastReindexJob, setLastReindexJob] = useState<Job | null>(null)
  const [selectedSection, setSelectedSection] =
    useState<KnowledgeBaseSettingsSection>("general")

  const knowledgeBaseQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.knowledgeBase("")
        : adminQueryKeys.knowledgeBase(knowledgeBaseId),
    queryFn: () =>
      knowledgeBaseId === undefined
        ? null
        : apiClient.getKnowledgeBase(knowledgeBaseId),
  })
  const systemSettingsQuery = useQuery({
    queryKey: adminQueryKeys.systemSettings(),
    queryFn: () => apiClient.getSystemSettings(),
  })
  const datasetConfigurationQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.datasetConfiguration("")
        : adminQueryKeys.datasetConfiguration(knowledgeBaseId),
    queryFn: () =>
      knowledgeBaseId === undefined
        ? null
        : apiClient.getDatasetConfiguration(knowledgeBaseId),
  })
  const datasetPresetQuery = useQuery({
    queryKey: adminQueryKeys.datasetConfigurationPresets(),
    queryFn: () => apiClient.listDatasetConfigurationPresets(),
  })

  const updateMutation = useMutation({
    mutationFn: (input: UpdateKnowledgeBaseInput) => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge Base ID is required.")
      }

      return apiClient.updateKnowledgeBase(knowledgeBaseId, input)
    },
    onMutate: () => setSaveStatus(null),
    onSuccess: (updatedKnowledgeBase) => {
      queryClient.setQueryData(
        adminQueryKeys.knowledgeBase(updatedKnowledgeBase.id),
        updatedKnowledgeBase
      )
      setKnowledgeBaseForm(updatedKnowledgeBase, {
        setGeneralForm,
        setPurpose,
        setRetrievalText,
        setSchemaText,
      })
      setSchemaError(null)
      setRetrievalError(null)
      setSaveStatus(t("kbSettings.saved"))
      showToast({ message: t("kbSettings.saved") })
    },
    onError: () => {
      showToast({ message: t("state.loadFailed"), variant: "error" })
    },
  })
  const updateDatasetConfigurationMutation = useMutation({
    mutationFn: (input: UpdateDatasetConfigurationInput) => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge Base ID is required.")
      }

      return apiClient.updateDatasetConfiguration(knowledgeBaseId, input)
    },
    onSuccess: async (configuration) => {
      setDatasetConfigurationForm(configuration, {
        setDatasetPresetId,
        setKnowledgeCheckText,
        setMarkdownContractText,
        setPromptTemplates,
        setPurpose,
        setRetrievalText,
        setSchemaText,
        setSourceLifecycleText,
        setSourceWatchText,
      })
      clearDatasetConfigurationErrors({
        setKnowledgeCheckError,
        setMarkdownContractError,
        setPromptTemplateError,
        setRetrievalError,
        setSchemaError,
        setSourceLifecycleError,
        setSourceWatchError,
      })

      if (knowledgeBaseId !== undefined) {
        queryClient.setQueryData(
          adminQueryKeys.datasetConfiguration(knowledgeBaseId),
          configuration
        )
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.knowledgeBase(knowledgeBaseId),
        })
      }

      showToast({ message: t("kbSettings.saved") })
    },
    onError: () => {
      showToast({ message: t("state.loadFailed"), variant: "error" })
    },
  })
  const validateContractMutation = useMutation({
    mutationFn: () => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge Base ID is required.")
      }

      return apiClient.validateMarkdownContract(knowledgeBaseId)
    },
    onSuccess: (result) => setContractStatus(result.status),
  })
  const deleteMutation = useMutation({
    mutationFn: () => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge Base ID is required.")
      }

      return apiClient.deleteKnowledgeBase(knowledgeBaseId)
    },
    onSuccess: async (result) => {
      showToast({
        message: t("cleanup.deleteQueued", {
          operationId: result.cleanup_operation.id,
        }),
      })
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.knowledgeBases(),
      })
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.cleanupOperations(),
      })
      navigate("/dashboard")
    },
  })
  const reindexMutation = useMutation({
    mutationFn: () => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge Base ID is required.")
      }

      return apiClient.rebuildKnowledgeBaseIndexes(knowledgeBaseId)
    },
    onSuccess: async (job) => {
      setLastReindexJob(job)
      setReindexDialogOpen(false)

      if (knowledgeBaseId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.jobs(knowledgeBaseId),
        })
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.ingestProgress(knowledgeBaseId),
        })
      }
    },
  })

  const knowledgeBase = knowledgeBaseQuery.data
  const datasetConfiguration = datasetConfigurationQuery.data
  const datasetPresets = datasetPresetQuery.data ?? []
  const modelSettings = systemSettingsQuery.data?.models
  const runtimeOcrStatus = readRecord(
    systemSettingsQuery.data?.dependencies,
    "ocr"
  )
  const runtimeOcrLimits = readRecord(systemSettingsQuery.data?.limits, "ocr")

  useEffect(() => {
    if (knowledgeBase !== null && knowledgeBase !== undefined) {
      setKnowledgeBaseForm(knowledgeBase, {
        setGeneralForm,
        setPurpose,
        setRetrievalText,
        setSchemaText,
      })
    }
  }, [knowledgeBase])

  useEffect(() => {
    if (datasetConfiguration !== null && datasetConfiguration !== undefined) {
      setDatasetConfigurationForm(datasetConfiguration, {
        setDatasetPresetId,
        setKnowledgeCheckText,
        setMarkdownContractText,
        setPromptTemplates,
        setPurpose,
        setRetrievalText,
        setSchemaText,
        setSourceLifecycleText,
        setSourceWatchText,
      })
    }
  }, [datasetConfiguration])

  const sections: Array<{ id: KnowledgeBaseSettingsSection; title: string }> = [
    { id: "general", title: t("settingsSection.general") },
    { id: "datasetPreset", title: t("settingsSection.datasetPreset") },
    { id: "purpose", title: t("settingsSection.purpose") },
    { id: "schema", title: t("settingsSection.schema") },
    { id: "markdownContract", title: t("settingsSection.markdownContract") },
    { id: "retrieval", title: t("settingsSection.retrieval") },
    { id: "sourceLifecycle", title: t("settingsSection.sourceLifecycle") },
    { id: "knowledgeCheck", title: t("settingsSection.knowledgeCheck") },
    { id: "promptTemplates", title: t("settingsSection.promptTemplates") },
    { id: "sourceWatch", title: t("settingsSection.sourceWatch") },
    { id: "ocrPolicy", title: t("settingsSection.ocrPolicy") },
    { id: "models", title: t("settingsSection.models") },
    { id: "dangerZone", title: t("settingsSection.dangerZone") },
  ]
  const selectedSectionTitle =
    sections.find((section) => section.id === selectedSection)?.title ??
    t("settingsSection.general")

  return (
    <div
      className="flex flex-col gap-5"
      data-route-id="knowledge-base-settings"
    >
      <h1 className="sr-only">{t("nav.settings")}</h1>
      {saveStatus === null ? null : (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {saveStatus}
        </div>
      )}
      {updateMutation.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {knowledgeBaseQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {knowledgeBaseQuery.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {knowledgeBase === null || knowledgeBase === undefined ? null : (
        <IdeWorkspace
          detail={
            <IdeDetailPanel title={selectedSectionTitle}>
              <KnowledgeBaseSettingsSectionPanel
                contractStatus={contractStatus}
                datasetConfiguration={datasetConfiguration ?? null}
                datasetPresetId={datasetPresetId}
                datasetPresets={datasetPresets}
                generalForm={generalForm}
                knowledgeCheckError={knowledgeCheckError}
                knowledgeCheckText={knowledgeCheckText}
                knowledgeBase={knowledgeBase}
                lastReindexJob={lastReindexJob}
                markdownContractError={markdownContractError}
                markdownContractText={markdownContractText}
                modelSettings={modelSettings}
                onDelete={() => setDeleteDialogOpen(true)}
                onReindex={() => setReindexDialogOpen(true)}
                promptTemplateError={promptTemplateError}
                promptTemplates={promptTemplates}
                purpose={purpose}
                reindexError={reindexMutation.isError}
                retrievalError={retrievalError}
                retrievalText={retrievalText}
                runtimeOcrLimits={runtimeOcrLimits}
                runtimeOcrStatus={runtimeOcrStatus}
                schemaError={schemaError}
                schemaText={schemaText}
                section={selectedSection}
                selectedPromptPurpose={selectedPromptPurpose}
                setDatasetPresetId={setDatasetPresetId}
                setGeneralForm={setGeneralForm}
                setKnowledgeCheckError={setKnowledgeCheckError}
                setKnowledgeCheckText={setKnowledgeCheckText}
                setMarkdownContractError={setMarkdownContractError}
                setMarkdownContractText={setMarkdownContractText}
                setPromptTemplateError={setPromptTemplateError}
                setPromptTemplates={setPromptTemplates}
                setPurpose={setPurpose}
                setRetrievalError={setRetrievalError}
                setRetrievalText={setRetrievalText}
                setSchemaError={setSchemaError}
                setSchemaText={setSchemaText}
                setSourceLifecycleError={setSourceLifecycleError}
                setSourceLifecycleText={setSourceLifecycleText}
                setSourceWatchError={setSourceWatchError}
                setSourceWatchText={setSourceWatchText}
                setSelectedPromptPurpose={setSelectedPromptPurpose}
                sourceLifecycleError={sourceLifecycleError}
                sourceLifecycleText={sourceLifecycleText}
                sourceWatchError={sourceWatchError}
                sourceWatchText={sourceWatchText}
                updateDatasetConfigurationMutation={
                  updateDatasetConfigurationMutation
                }
                updateMutation={updateMutation}
                validateContractMutation={validateContractMutation}
              />
            </IdeDetailPanel>
          }
          explorer={
            <IdeExplorer>
              <IdeExplorerGroup
                count={sections.length}
                title={t("ide.settingsSections")}
              >
                {sections.map((section) => (
                  <IdeExplorerItem
                    active={section.id === selectedSection}
                    key={section.id}
                    onSelect={() => setSelectedSection(section.id)}
                    title={section.title}
                  />
                ))}
              </IdeExplorerGroup>
            </IdeExplorer>
          }
        />
      )}
      {knowledgeBaseQuery.isSuccess && knowledgeBase === null ? (
        <EmptyState title={t("state.loadFailed")} />
      ) : null}
      <DangerousAction
        cancelLabel={t("action.cancel")}
        confirmLabel={t("kbSettings.deleteKnowledgeBase")}
        description={t("dashboard.deleteKnowledgeBaseDescription")}
        onConfirm={() => deleteMutation.mutate()}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        title={t("dashboard.deleteKnowledgeBase")}
      />
      <DangerousAction
        cancelLabel={t("action.cancel")}
        confirmLabel={t("kbSettings.rebuildAllIndexes")}
        description={t("kbSettings.rebuildIndexesDescription")}
        onConfirm={() => reindexMutation.mutate()}
        onOpenChange={setReindexDialogOpen}
        open={reindexDialogOpen}
        title={t("kbSettings.rebuildIndexes")}
      />
    </div>
  )
}

function KnowledgeBaseSettingsSectionPanel({
  contractStatus,
  datasetConfiguration,
  datasetPresetId,
  datasetPresets,
  generalForm,
  knowledgeCheckError,
  knowledgeCheckText,
  knowledgeBase,
  lastReindexJob,
  markdownContractError,
  markdownContractText,
  modelSettings,
  onDelete,
  onReindex,
  promptTemplateError,
  promptTemplates,
  purpose,
  reindexError,
  retrievalError,
  retrievalText,
  runtimeOcrLimits,
  runtimeOcrStatus,
  schemaError,
  schemaText,
  section,
  selectedPromptPurpose,
  setDatasetPresetId,
  setGeneralForm,
  setKnowledgeCheckError,
  setKnowledgeCheckText,
  setMarkdownContractError,
  setMarkdownContractText,
  setPromptTemplateError,
  setPromptTemplates,
  setPurpose,
  setRetrievalError,
  setRetrievalText,
  setSchemaError,
  setSchemaText,
  setSourceLifecycleError,
  setSourceLifecycleText,
  setSourceWatchError,
  setSourceWatchText,
  setSelectedPromptPurpose,
  sourceLifecycleError,
  sourceLifecycleText,
  sourceWatchError,
  sourceWatchText,
  updateDatasetConfigurationMutation,
  updateMutation,
  validateContractMutation,
}: {
  contractStatus: string | null
  datasetConfiguration: DatasetConfiguration | null
  datasetPresetId: KnowledgeBaseTemplate
  datasetPresets: DatasetConfigurationPreset[]
  generalForm: {
    description: string
    name: string
    outputLanguage: KnowledgeBaseOutputLanguage
  }
  knowledgeCheckError: string | null
  knowledgeCheckText: string
  knowledgeBase: KnowledgeBase
  lastReindexJob: Job | null
  markdownContractError: string | null
  markdownContractText: string
  modelSettings: Record<string, unknown> | undefined
  onDelete: () => void
  onReindex: () => void
  promptTemplateError: string | null
  promptTemplates: DatasetPromptTemplateValues
  purpose: string
  reindexError: boolean
  retrievalError: string | null
  retrievalText: string
  runtimeOcrLimits: Record<string, unknown> | undefined
  runtimeOcrStatus: Record<string, unknown> | undefined
  schemaError: string | null
  schemaText: string
  section: KnowledgeBaseSettingsSection
  selectedPromptPurpose: PromptPurpose
  setDatasetPresetId: (value: KnowledgeBaseTemplate) => void
  setGeneralForm: (value: {
    description: string
    name: string
    outputLanguage: KnowledgeBaseOutputLanguage
  }) => void
  setKnowledgeCheckError: (value: string | null) => void
  setKnowledgeCheckText: (value: string) => void
  setMarkdownContractError: (value: string | null) => void
  setMarkdownContractText: (value: string) => void
  setPromptTemplateError: (value: string | null) => void
  setPromptTemplates: (value: DatasetPromptTemplateValues) => void
  setPurpose: (value: string) => void
  setRetrievalError: (value: string | null) => void
  setRetrievalText: (value: string) => void
  setSchemaError: (value: string | null) => void
  setSchemaText: (value: string) => void
  setSourceLifecycleError: (value: string | null) => void
  setSourceLifecycleText: (value: string) => void
  setSourceWatchError: (value: string | null) => void
  setSourceWatchText: (value: string) => void
  setSelectedPromptPurpose: (value: PromptPurpose) => void
  sourceLifecycleError: string | null
  sourceLifecycleText: string
  sourceWatchError: string | null
  sourceWatchText: string
  updateDatasetConfigurationMutation: {
    isPending: boolean
    mutate: (input: UpdateDatasetConfigurationInput) => void
  }
  updateMutation: {
    isPending: boolean
    mutate: (input: UpdateKnowledgeBaseInput) => void
  }
  validateContractMutation: {
    isError: boolean
    isPending: boolean
    mutate: () => void
  }
}) {
  const { t } = useTranslation()
  const selectedPreset =
    datasetPresets.find((preset) => preset.id === datasetPresetId) ??
    datasetPresets[0] ??
    null

  const saveDatasetJsonSection = (
    sectionName: DatasetJsonSection,
    text: string,
    setError: (value: string | null) => void
  ) => {
    const parsed = parseJsonObject(text)

    if (parsed === null) {
      setError(t("kbSettings.invalidJson"))
      return
    }

    setError(null)
    updateDatasetConfigurationMutation.mutate({
      values: {
        [sectionName]: parsed,
      } as Partial<DatasetConfigurationValues>,
    })
  }

  if (section === "general") {
    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("knowledgeBase.id")}>
          <ResourceIdDisplay resourceId={knowledgeBase.id} />
        </KeyValue>
        <KeyValue label={t("knowledgeBase.currentVersion")}>
          <ResourceIdDisplay resourceId={knowledgeBase.current_version_id} />
        </KeyValue>
        <LabeledInput
          label={t("knowledgeBase.name")}
          onChange={(value) => setGeneralForm({ ...generalForm, name: value })}
          value={generalForm.name}
        />
        <LabeledTextarea
          label={t("knowledgeBase.description")}
          onChange={(value) =>
            setGeneralForm({ ...generalForm, description: value })
          }
          value={generalForm.description}
        />
        <LabeledSelect
          label={t("knowledgeBase.outputLanguage")}
          onChange={(value) =>
            setGeneralForm({
              ...generalForm,
              outputLanguage: value as KnowledgeBaseOutputLanguage,
            })
          }
          options={[
            { label: t("outputLanguage.auto"), value: "auto" },
            { label: t("outputLanguage.zh-CN"), value: "zh-CN" },
            { label: t("outputLanguage.en-US"), value: "en-US" },
          ]}
          value={generalForm.outputLanguage}
        />
        <KeyValue label={t("knowledgeBase.template")}>
          {t(`template.${knowledgeBase.template}`)}
        </KeyValue>
        <Button
          disabled={updateMutation.isPending}
          onClick={() =>
            updateMutation.mutate({
              description: generalForm.description,
              name: generalForm.name,
              output_language: generalForm.outputLanguage,
            })
          }
          type="button"
          variant="outline"
        >
          {t("action.saveChanges")}
        </Button>
      </div>
    )
  }

  if (section === "datasetPreset") {
    return (
      <FieldGroup>
        <KeyValue label={t("kbSettings.datasetConfigurationId")}>
          {datasetConfiguration === null ? (
            t("systemSettings.noValue")
          ) : (
            <ResourceIdDisplay resourceId={datasetConfiguration.id} />
          )}
        </KeyValue>
        <KeyValue label={t("kbSettings.datasetConfigurationVersion")}>
          {datasetConfiguration?.version ?? t("systemSettings.noValue")}
        </KeyValue>
        <LabeledSelect
          label={t("kbSettings.datasetPreset")}
          onChange={(value) =>
            setDatasetPresetId(value as KnowledgeBaseTemplate)
          }
          options={datasetPresets.map((preset) => ({
            label: preset.name,
            value: preset.id,
          }))}
          value={datasetPresetId}
        />
        {selectedPreset === null ? null : (
          <FieldDescription>{selectedPreset.description}</FieldDescription>
        )}
        {selectedPreset === null ? null : (
          <details className="rounded-md border p-3" open>
            <summary className="cursor-pointer text-sm font-medium">
              {t("kbSettings.presetDefaults")}
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">
              {JSON.stringify(selectedPreset.default_values, null, 2)}
            </pre>
          </details>
        )}
        <Button
          disabled={
            selectedPreset === null ||
            updateDatasetConfigurationMutation.isPending
          }
          onClick={() => {
            if (selectedPreset === null) {
              return
            }

            updateDatasetConfigurationMutation.mutate({
              preset_id: selectedPreset.id,
              values: selectedPreset.default_values,
            })
          }}
          type="button"
          variant="outline"
        >
          {t("kbSettings.applyPreset")}
        </Button>
      </FieldGroup>
    )
  }

  if (section === "purpose") {
    return (
      <FieldGroup>
        <LabeledTextarea
          label={t("kbSettings.knowledgePurpose")}
          minHeightClassName="min-h-32"
          onChange={setPurpose}
          value={purpose}
        />
        <div className="flex gap-2">
          <Button
            disabled={updateDatasetConfigurationMutation.isPending}
            onClick={() =>
              updateDatasetConfigurationMutation.mutate({
                values: { purpose },
              })
            }
            type="button"
            variant="outline"
          >
            {t("kbSettings.savePurpose")}
          </Button>
          <Button
            disabled={
              selectedPreset === null ||
              updateDatasetConfigurationMutation.isPending
            }
            onClick={() => {
              if (selectedPreset === null) {
                return
              }

              updateDatasetConfigurationMutation.mutate({
                values: { purpose: selectedPreset.default_values.purpose },
              })
            }}
            type="button"
            variant="outline"
          >
            {t("kbSettings.resetToTemplate")}
          </Button>
        </div>
      </FieldGroup>
    )
  }

  if (section === "schema") {
    return (
      <FieldGroup>
        <LabeledTextarea
          label={t("kbSettings.wikiSchema")}
          minHeightClassName="min-h-48"
          onChange={(value) => {
            setSchemaText(value)
            setSchemaError(null)
          }}
          value={schemaText}
        />
        {schemaError === null ? null : (
          <div className="text-sm text-destructive" role="alert">
            {schemaError}
          </div>
        )}
        {validateContractMutation.isError ? (
          <ErrorAlert title={t("state.loadFailed")} />
        ) : null}
        {contractStatus === null ? null : (
          <KeyValue label={t("kbSettings.contractStatus")}>
            {formatStatus(t, contractStatus)}
          </KeyValue>
        )}
        <div className="flex gap-2">
          <Button
            disabled={updateDatasetConfigurationMutation.isPending}
            onClick={() => {
              saveDatasetJsonSection("schema", schemaText, setSchemaError)
            }}
            type="button"
            variant="outline"
          >
            {t("kbSettings.saveSchema")}
          </Button>
          <Button
            disabled={validateContractMutation.isPending}
            onClick={() => validateContractMutation.mutate()}
            type="button"
            variant="outline"
          >
            {t("kbSettings.validateMarkdownContract")}
          </Button>
          <Button
            disabled={
              selectedPreset === null ||
              updateDatasetConfigurationMutation.isPending
            }
            onClick={() => {
              if (selectedPreset === null) {
                return
              }

              updateDatasetConfigurationMutation.mutate({
                values: { schema: selectedPreset.default_values.schema },
              })
            }}
            type="button"
            variant="outline"
          >
            {t("kbSettings.resetToTemplate")}
          </Button>
        </div>
      </FieldGroup>
    )
  }

  if (section === "markdownContract") {
    return (
      <DatasetJsonEditor
        description={t("kbSettings.markdownContractDescription")}
        disabled={updateDatasetConfigurationMutation.isPending}
        error={markdownContractError}
        label={t("kbSettings.markdownContract")}
        onChange={(value) => {
          setMarkdownContractText(value)
          setMarkdownContractError(null)
        }}
        onSave={() =>
          saveDatasetJsonSection(
            "markdown_contract",
            markdownContractText,
            setMarkdownContractError
          )
        }
        value={markdownContractText}
      />
    )
  }

  if (section === "retrieval") {
    return (
      <FieldGroup>
        <RetrievalSettingsForm
          onChange={(value) => {
            setRetrievalText(value)
            setRetrievalError(null)
          }}
          value={retrievalText}
        />
        {retrievalError === null ? null : (
          <div className="text-sm text-destructive" role="alert">
            {retrievalError}
          </div>
        )}
        <KeyValue label={t("kbSettings.semanticSourceLabel")}>
          {t("kbSettings.semanticSource")}
        </KeyValue>
        <Button
          disabled={updateDatasetConfigurationMutation.isPending}
          onClick={() => {
            saveDatasetJsonSection(
              "retrieval",
              retrievalText,
              setRetrievalError
            )
          }}
          type="button"
          variant="outline"
        >
          {t("kbSettings.saveRetrieval")}
        </Button>
      </FieldGroup>
    )
  }

  if (section === "sourceLifecycle") {
    return (
      <DatasetJsonEditor
        description={t("kbSettings.sourceLifecycleDescription")}
        disabled={updateDatasetConfigurationMutation.isPending}
        error={sourceLifecycleError}
        label={t("kbSettings.sourceLifecycle")}
        onChange={(value) => {
          setSourceLifecycleText(value)
          setSourceLifecycleError(null)
        }}
        onSave={() =>
          saveDatasetJsonSection(
            "source_lifecycle",
            sourceLifecycleText,
            setSourceLifecycleError
          )
        }
        value={sourceLifecycleText}
      />
    )
  }

  if (section === "knowledgeCheck") {
    return (
      <DatasetJsonEditor
        description={t("kbSettings.knowledgeCheckDescription")}
        disabled={updateDatasetConfigurationMutation.isPending}
        error={knowledgeCheckError}
        label={t("kbSettings.knowledgeCheck")}
        onChange={(value) => {
          setKnowledgeCheckText(value)
          setKnowledgeCheckError(null)
        }}
        onSave={() =>
          saveDatasetJsonSection(
            "knowledge_check",
            knowledgeCheckText,
            setKnowledgeCheckError
          )
        }
        value={knowledgeCheckText}
      />
    )
  }

  if (section === "promptTemplates") {
    return (
      <PromptTemplatesPanel
        disabled={updateDatasetConfigurationMutation.isPending}
        error={promptTemplateError}
        onChange={(value) => {
          setPromptTemplates(value)
          setPromptTemplateError(null)
        }}
        onResetAll={() => {
          const nextPromptTemplates = createDefaultPromptTemplates()

          setPromptTemplates(nextPromptTemplates)
          setPromptTemplateError(null)
          updateDatasetConfigurationMutation.mutate({
            values: {
              prompt_templates: nextPromptTemplates,
            },
          })
        }}
        onResetCurrent={() => {
          const nextPromptTemplates = {
            ...promptTemplates,
            [selectedPromptPurpose]: createDefaultPromptTemplateValue(
              selectedPromptPurpose
            ),
          }

          setPromptTemplates(nextPromptTemplates)
          setPromptTemplateError(null)
          updateDatasetConfigurationMutation.mutate({
            values: {
              prompt_templates: nextPromptTemplates,
            },
          })
        }}
        onSave={() => {
          const validationError = validatePromptTemplateValue(
            selectedPromptPurpose,
            promptTemplates[selectedPromptPurpose],
            t
          )

          if (validationError !== null) {
            setPromptTemplateError(validationError)
            return
          }

          setPromptTemplateError(null)
          updateDatasetConfigurationMutation.mutate({
            values: {
              prompt_templates: promptTemplates,
            },
          })
        }}
        onValidate={() => {
          const validationError = validatePromptTemplateValue(
            selectedPromptPurpose,
            promptTemplates[selectedPromptPurpose],
            t
          )

          setPromptTemplateError(validationError)

          if (validationError === null) {
            showToast({ message: t("kbSettings.promptValidationPassed") })
          }
        }}
        selectedPurpose={selectedPromptPurpose}
        setSelectedPurpose={setSelectedPromptPurpose}
        value={promptTemplates}
      />
    )
  }

  if (section === "sourceWatch") {
    return (
      <DatasetJsonEditor
        description={t("kbSettings.sourceWatchDescription")}
        disabled={updateDatasetConfigurationMutation.isPending}
        error={sourceWatchError}
        label={t("kbSettings.sourceWatchPolicy")}
        onChange={(value) => {
          setSourceWatchText(value)
          setSourceWatchError(null)
        }}
        onSave={() =>
          saveDatasetJsonSection(
            "source_watch",
            sourceWatchText,
            setSourceWatchError
          )
        }
        value={sourceWatchText}
      />
    )
  }

  if (section === "ocrPolicy") {
    return (
      <OcrPolicyPanel
        datasetConfiguration={datasetConfiguration}
        disabled={updateDatasetConfigurationMutation.isPending}
        runtimeLimits={runtimeOcrLimits}
        runtimeStatus={runtimeOcrStatus}
        updateDatasetConfigurationMutation={updateDatasetConfigurationMutation}
      />
    )
  }

  if (section === "models") {
    return (
      <div className="flex flex-col gap-4">
        <KeyValue label={t("systemSettings.chatProvider")}>
          {readNestedValue(modelSettings, "chat", "providerName") ??
            t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.embeddingProvider")}>
          {readNestedValue(modelSettings, "embedding", "providerName") ??
            t("systemSettings.noValue")}
        </KeyValue>
        <KeyValue label={t("systemSettings.rerankStatus")}>
          {formatStatus(t, readNestedValue(modelSettings, "rerank", "status"))}
        </KeyValue>
        <div className="text-sm text-muted-foreground">
          {t("kbSettings.envModelBoundary")}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={onReindex} type="button" variant="destructive">
        {t("kbSettings.rebuildIndexes")}
      </Button>
      <div className="text-sm text-muted-foreground">
        {t("kbSettings.rebuildBoundary")}
      </div>
      {lastReindexJob === null ? null : (
        <KeyValue label={t("kbSettings.lastReindexJob")}>
          <ResourceIdDisplay resourceId={lastReindexJob.id} />
        </KeyValue>
      )}
      {reindexError ? <ErrorAlert title={t("state.loadFailed")} /> : null}
      <Button onClick={onDelete} type="button" variant="destructive">
        {t("kbSettings.deleteKnowledgeBase")}
      </Button>
    </div>
  )
}

function KeyValue({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function PromptTemplatesPanel({
  disabled,
  error,
  onChange,
  onResetAll,
  onResetCurrent,
  onSave,
  onValidate,
  selectedPurpose,
  setSelectedPurpose,
  value,
}: {
  disabled: boolean
  error: string | null
  onChange: (value: DatasetPromptTemplateValues) => void
  onResetAll: () => void
  onResetCurrent: () => void
  onSave: () => void
  onValidate: () => void
  selectedPurpose: PromptPurpose
  setSelectedPurpose: (value: PromptPurpose) => void
  value: DatasetPromptTemplateValues
}) {
  const { t } = useTranslation()
  const current =
    value[selectedPurpose] ?? createDefaultPromptTemplateValue(selectedPurpose)
  const preview = createEffectivePromptPreview(selectedPurpose, current)
  const builtInPromptId = createBuiltInPromptId(selectedPurpose)
  const updateCurrentPrompt = (patch: Partial<DatasetPromptTemplateValue>) => {
    onChange({
      ...value,
      [selectedPurpose]: normalizePromptTemplateValue(selectedPurpose, {
        ...current,
        ...patch,
      }),
    })
  }

  return (
    <FieldGroup>
      <LabeledSelect
        label={t("kbSettings.promptPurpose")}
        onChange={(nextPurpose) =>
          setSelectedPurpose(nextPurpose as PromptPurpose)
        }
        options={promptPurposes.map((purpose) => ({
          label: t(`promptPurpose.${purpose}`),
          value: purpose,
        }))}
        value={selectedPurpose}
      />
      <KeyValue label={t("kbSettings.promptBuiltInId")}>
        {current.built_in_prompt_id || builtInPromptId}
      </KeyValue>
      <LabeledSelect
        label={t("kbSettings.promptMode")}
        onChange={(mode) =>
          updateCurrentPrompt({
            mode: mode as PromptTemplateMode,
          })
        }
        options={[
          { label: t("promptMode.built_in"), value: "built_in" },
          {
            label: t("promptMode.custom_instructions"),
            value: "custom_instructions",
          },
          {
            label: t("promptMode.override_template"),
            value: "override_template",
          },
        ]}
        value={current.mode}
      />
      <ReadOnlyPromptTextarea
        label={t("kbSettings.promptBuiltInPreview")}
        value={builtInPromptTextByPurpose[selectedPurpose]}
      />
      {current.mode === "custom_instructions" ? (
        <PromptTextarea
          description={t("kbSettings.promptCustomInstructionsDescription")}
          label={t("kbSettings.promptCustomInstructions")}
          onChange={(customInstructions) =>
            updateCurrentPrompt({
              custom_instructions: customInstructions,
            })
          }
          value={current.custom_instructions ?? ""}
        />
      ) : null}
      {current.mode === "override_template" ? (
        <PromptTextarea
          description={t("kbSettings.promptOverrideDescription")}
          label={t("kbSettings.promptOverrideTemplate")}
          onChange={(overrideTemplate) =>
            updateCurrentPrompt({
              override_template: overrideTemplate,
            })
          }
          value={current.override_template ?? ""}
        />
      ) : null}
      <Field data-invalid={error !== null}>
        <FieldLabel>{t("kbSettings.promptCompiledPreview")}</FieldLabel>
        <FieldDescription>
          {t("kbSettings.promptCompiledPreviewDescription")}
        </FieldDescription>
        <Textarea
          aria-invalid={error !== null}
          className="min-h-64 font-mono text-sm"
          readOnly
          value={preview}
        />
        {error === null ? null : <FieldError>{error}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled}
          onClick={onValidate}
          type="button"
          variant="outline"
        >
          {t("kbSettings.validatePrompt")}
        </Button>
        <Button
          disabled={disabled}
          onClick={onSave}
          type="button"
          variant="outline"
        >
          {t("action.saveChanges")}
        </Button>
        <Button
          disabled={disabled}
          onClick={onResetCurrent}
          type="button"
          variant="outline"
        >
          {t("kbSettings.resetCurrentPrompt")}
        </Button>
        <Button
          disabled={disabled}
          onClick={onResetAll}
          type="button"
          variant="outline"
        >
          {t("kbSettings.resetAllPrompts")}
        </Button>
      </div>
    </FieldGroup>
  )
}

function PromptTextarea({
  description,
  label,
  onChange,
  value,
}: {
  description: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  const id = createFieldId(label)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <Textarea
        className="min-h-40 font-mono text-sm"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </Field>
  )
}

function ReadOnlyPromptTextarea({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const id = createFieldId(label)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        className="min-h-32 font-mono text-sm"
        id={id}
        readOnly
        value={value}
      />
    </Field>
  )
}

function OcrPolicyPanel({
  datasetConfiguration,
  disabled,
  runtimeLimits,
  runtimeStatus,
  updateDatasetConfigurationMutation,
}: {
  datasetConfiguration: DatasetConfiguration | null
  disabled: boolean
  runtimeLimits: Record<string, unknown> | undefined
  runtimeStatus: Record<string, unknown> | undefined
  updateDatasetConfigurationMutation: {
    mutate: (input: UpdateDatasetConfigurationInput) => void
  }
}) {
  const { t } = useTranslation()
  const policy = datasetConfiguration?.values.ocr_policy ?? defaultOcrPolicy()
  const [mode, setMode] = useState<DatasetOcrPolicy["mode"]>(policy.mode)
  const [maxPages, setMaxPages] = useState(
    policy.max_pages_per_document === null
      ? ""
      : String(policy.max_pages_per_document)
  )
  const [minTextChars, setMinTextChars] = useState(
    policy.min_text_chars_per_page === null
      ? ""
      : String(policy.min_text_chars_per_page)
  )
  const [error, setError] = useState<string | null>(null)
  const deploymentMaxPages = readNumber(runtimeLimits, "maxPagesPerDocument")
  const deploymentMinTextChars = readNumber(
    runtimeLimits,
    "minTextCharsPerPage"
  )

  useEffect(() => {
    setMode(policy.mode)
    setMaxPages(
      policy.max_pages_per_document === null
        ? ""
        : String(policy.max_pages_per_document)
    )
    setMinTextChars(
      policy.min_text_chars_per_page === null
        ? ""
        : String(policy.min_text_chars_per_page)
    )
    setError(null)
  }, [
    policy.max_pages_per_document,
    policy.min_text_chars_per_page,
    policy.mode,
  ])

  const savePolicy = () => {
    const parsedMaxPages = parseOptionalPositiveInteger(maxPages)
    const parsedMinTextChars = parseOptionalPositiveInteger(minTextChars)

    if (
      parsedMaxPages === null ||
      parsedMinTextChars === null ||
      (deploymentMaxPages !== null &&
        parsedMaxPages !== undefined &&
        parsedMaxPages > deploymentMaxPages) ||
      (deploymentMinTextChars !== null &&
        parsedMinTextChars !== undefined &&
        parsedMinTextChars > deploymentMinTextChars)
    ) {
      setError(t("kbSettings.ocrPolicyInvalid"))
      return
    }

    setError(null)
    updateDatasetConfigurationMutation.mutate({
      values: {
        ocr_policy: {
          mode,
          max_pages_per_document: parsedMaxPages ?? null,
          min_text_chars_per_page: parsedMinTextChars ?? null,
        },
      },
    })
  }

  return (
    <FieldGroup>
      <KeyValue label={t("kbSettings.ocrRuntimeStatus")}>
        {formatStatus(t, runtimeStatus?.status)}
      </KeyValue>
      <KeyValue label={t("kbSettings.ocrRuntimeHealth")}>
        {formatStatus(t, runtimeStatus?.health)}
      </KeyValue>
      <KeyValue label={t("kbSettings.ocrRuntimeProvider")}>
        {displayOptional(runtimeStatus?.provider, t("systemSettings.noValue"))}
      </KeyValue>
      <KeyValue label={t("kbSettings.ocrDeploymentCaps")}>
        <JsonBlock
          value={{
            maxPagesPerDocument: deploymentMaxPages,
            minTextCharsPerPage: deploymentMinTextChars,
          }}
        />
      </KeyValue>
      <LabeledSelect
        label={t("kbSettings.ocrMode")}
        onChange={(value) => setMode(value as DatasetOcrPolicy["mode"])}
        options={[
          { label: t("settings.ocr.mode.auto"), value: "auto" },
          { label: t("settings.ocr.mode.disabled"), value: "disabled" },
          {
            label: t("settings.ocr.mode.force_for_pdf"),
            value: "force_for_pdf",
          },
        ]}
        value={mode}
      />
      <OptionalNumberInput
        description={t("kbSettings.ocrMaxPagesDescription")}
        label={t("kbSettings.ocrMaxPages")}
        onChange={setMaxPages}
        placeholder={
          deploymentMaxPages === null
            ? t("systemSettings.noValue")
            : String(deploymentMaxPages)
        }
        value={maxPages}
      />
      <OptionalNumberInput
        description={t("kbSettings.ocrMinTextCharsDescription")}
        label={t("kbSettings.ocrMinTextChars")}
        onChange={setMinTextChars}
        placeholder={
          deploymentMinTextChars === null
            ? t("systemSettings.noValue")
            : String(deploymentMinTextChars)
        }
        value={minTextChars}
      />
      {error === null ? null : <FieldError>{error}</FieldError>}
      <Button
        disabled={disabled}
        onClick={savePolicy}
        type="button"
        variant="outline"
      >
        {t("action.saveChanges")}
      </Button>
    </FieldGroup>
  )
}

function OptionalNumberInput({
  description,
  label,
  onChange,
  placeholder,
  value,
}: {
  description: string
  label: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  const id = createFieldId(label)

  return (
    <Field>
      <FieldLabel className="text-muted-foreground" htmlFor={id}>
        {label}
      </FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <Input
        id={id}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </Field>
  )
}

function DatasetJsonEditor({
  description,
  disabled,
  error,
  label,
  onChange,
  onSave,
  value,
}: {
  description: string
  disabled: boolean
  error: string | null
  label: string
  onChange: (value: string) => void
  onSave: () => void
  value: string
}) {
  const { t } = useTranslation()
  const id = createFieldId(label)

  return (
    <FieldGroup>
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
        <Textarea
          aria-invalid={error !== null}
          className="min-h-48 font-mono text-sm"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
        {error === null ? null : <FieldError>{error}</FieldError>}
      </Field>
      <Button
        disabled={disabled}
        onClick={onSave}
        type="button"
        variant="outline"
      >
        {t("action.saveChanges")}
      </Button>
    </FieldGroup>
  )
}

function RetrievalSettingsForm({
  onChange,
  value,
}: {
  onChange: (value: string) => void
  value: string
}) {
  const { t } = useTranslation()
  const settings = readRetrievalSettings(value)

  return (
    <div className="flex flex-col gap-4">
      <LabeledSelect
        label={t("kbSettings.retrievalMode")}
        onChange={(mode) => onChange(writeRetrievalSettings(value, { mode }))}
        options={[
          { label: t("retrieval.modeHybrid"), value: "hybrid" },
          { label: t("retrieval.modeKeyword"), value: "keyword" },
          { label: t("retrieval.modeSemantic"), value: "semantic" },
          { label: t("retrieval.modeGraph"), value: "graph" },
        ]}
        value={settings.mode}
      />
      <LabeledInput
        label={t("kbSettings.retrievalTopK")}
        onChange={(nextValue) =>
          onChange(writeRetrievalSettings(value, { topK: nextValue }))
        }
        value={settings.topK}
      />
      <LabeledInput
        label={t("kbSettings.retrievalGraphDepth")}
        onChange={(nextValue) =>
          onChange(writeRetrievalSettings(value, { graphDepth: nextValue }))
        }
        value={settings.graphDepth}
      />
      <LabeledInput
        label={t("kbSettings.retrievalGraphLimit")}
        onChange={(nextValue) =>
          onChange(writeRetrievalSettings(value, { graphLimit: nextValue }))
        }
        value={settings.graphLimit}
      />
      <LabeledInput
        label={t("kbSettings.retrievalContextBudget")}
        onChange={(nextValue) =>
          onChange(writeRetrievalSettings(value, { contextBudget: nextValue }))
        }
        value={settings.contextBudget}
      />
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("kbSettings.retrievalRawJson")}
        </summary>
        <pre className="mt-3 max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">
          {value}
        </pre>
      </details>
    </div>
  )
}

interface RetrievalSettingsPatch {
  contextBudget?: string
  graphDepth?: string
  graphLimit?: string
  mode?: string
  topK?: string
}

function LabeledInput({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  const id = createFieldId(label)

  return (
    <Field>
      <FieldLabel className="text-muted-foreground" htmlFor={id}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </Field>
  )
}

function LabeledTextarea({
  label,
  minHeightClassName = "min-h-24",
  onChange,
  value,
}: {
  label: string
  minHeightClassName?: string
  onChange: (value: string) => void
  value: string
}) {
  const id = createFieldId(label)

  return (
    <Field>
      <FieldLabel className="text-muted-foreground" htmlFor={id}>
        {label}
      </FieldLabel>
      <Textarea
        className={`${minHeightClassName} font-mono`}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </Field>
  )
}

function LabeledSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}) {
  const id = createFieldId(label)

  return (
    <Field>
      <FieldLabel className="text-muted-foreground" htmlFor={id}>
        {label}
      </FieldLabel>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function setKnowledgeBaseForm(
  knowledgeBase: KnowledgeBase,
  setters: {
    setGeneralForm: (value: {
      description: string
      name: string
      outputLanguage: KnowledgeBaseOutputLanguage
    }) => void
    setPurpose: (value: string) => void
    setRetrievalText: (value: string) => void
    setSchemaText: (value: string) => void
  }
) {
  setters.setGeneralForm({
    description: knowledgeBase.description ?? "",
    name: knowledgeBase.name,
    outputLanguage: knowledgeBase.output_language,
  })
  setters.setPurpose(knowledgeBase.purpose)
  setters.setSchemaText(JSON.stringify(knowledgeBase.schema, null, 2))
  setters.setRetrievalText(JSON.stringify(knowledgeBase.retrieval, null, 2))
}

function setDatasetConfigurationForm(
  configuration: DatasetConfiguration,
  setters: {
    setDatasetPresetId: (value: KnowledgeBaseTemplate) => void
    setKnowledgeCheckText: (value: string) => void
    setMarkdownContractText: (value: string) => void
    setPromptTemplates: (value: DatasetPromptTemplateValues) => void
    setPurpose: (value: string) => void
    setRetrievalText: (value: string) => void
    setSchemaText: (value: string) => void
    setSourceLifecycleText: (value: string) => void
    setSourceWatchText: (value: string) => void
  }
) {
  setters.setDatasetPresetId(configuration.preset_id)
  setters.setPurpose(configuration.values.purpose)
  setters.setSchemaText(JSON.stringify(configuration.values.schema, null, 2))
  setters.setMarkdownContractText(
    JSON.stringify(configuration.values.markdown_contract, null, 2)
  )
  setters.setRetrievalText(
    JSON.stringify(configuration.values.retrieval, null, 2)
  )
  setters.setSourceLifecycleText(
    JSON.stringify(configuration.values.source_lifecycle, null, 2)
  )
  setters.setKnowledgeCheckText(
    JSON.stringify(configuration.values.knowledge_check, null, 2)
  )
  setters.setSourceWatchText(
    JSON.stringify(configuration.values.source_watch, null, 2)
  )
  setters.setPromptTemplates(
    normalizePromptTemplates(configuration.values.prompt_templates)
  )
}

function clearDatasetConfigurationErrors(setters: {
  setKnowledgeCheckError: (value: string | null) => void
  setMarkdownContractError: (value: string | null) => void
  setPromptTemplateError: (value: string | null) => void
  setRetrievalError: (value: string | null) => void
  setSchemaError: (value: string | null) => void
  setSourceLifecycleError: (value: string | null) => void
  setSourceWatchError: (value: string | null) => void
}) {
  setters.setKnowledgeCheckError(null)
  setters.setMarkdownContractError(null)
  setters.setPromptTemplateError(null)
  setters.setRetrievalError(null)
  setters.setSchemaError(null)
  setters.setSourceLifecycleError(null)
  setters.setSourceWatchError(null)
}

function defaultOcrPolicy(): DatasetOcrPolicy {
  return {
    mode: "auto",
    max_pages_per_document: null,
    min_text_chars_per_page: null,
  }
}

function createDefaultPromptTemplates(): DatasetPromptTemplateValues {
  return Object.fromEntries(
    promptPurposes.map((purpose) => [
      purpose,
      createDefaultPromptTemplateValue(purpose),
    ])
  ) as DatasetPromptTemplateValues
}

function createDefaultPromptTemplateValue(
  purpose: PromptPurpose
): DatasetPromptTemplateValue {
  return {
    built_in_prompt_id: createBuiltInPromptId(purpose),
    custom_instructions: null,
    mode: "built_in",
    override_template: null,
  }
}

function createBuiltInPromptId(purpose: PromptPurpose): string {
  return `${purpose}@0.1.0`
}

function normalizePromptTemplates(
  value: DatasetPromptTemplateValues | undefined
): DatasetPromptTemplateValues {
  const defaults = createDefaultPromptTemplates()

  if (value === undefined) {
    return defaults
  }

  return Object.fromEntries(
    promptPurposes.map((purpose) => [
      purpose,
      normalizePromptTemplateValue(purpose, value[purpose]),
    ])
  ) as DatasetPromptTemplateValues
}

function normalizePromptTemplateValue(
  purpose: PromptPurpose,
  value: DatasetPromptTemplateValue | undefined
): DatasetPromptTemplateValue {
  const fallback = createDefaultPromptTemplateValue(purpose)

  if (value === undefined) {
    return fallback
  }

  return {
    built_in_prompt_id: value.built_in_prompt_id || fallback.built_in_prompt_id,
    custom_instructions:
      value.mode === "custom_instructions"
        ? (value.custom_instructions ?? "")
        : null,
    mode: readPromptTemplateMode(value.mode),
    override_template:
      value.mode === "override_template"
        ? (value.override_template ?? "")
        : null,
    ...(value.updated_at === undefined ? {} : { updated_at: value.updated_at }),
  }
}

function readPromptTemplateMode(value: string): PromptTemplateMode {
  return value === "custom_instructions" || value === "override_template"
    ? value
    : "built_in"
}

function createEffectivePromptPreview(
  purpose: PromptPurpose,
  value: DatasetPromptTemplateValue
): string {
  if (value.mode === "override_template") {
    return value.override_template ?? ""
  }

  const sections = [
    `Built-in prompt ${createBuiltInPromptId(purpose)}: ${builtInPromptTextByPurpose[purpose]}`,
    "Required contract: preserve source traceability, do not make unsupported claims, and follow the structured output contract for this workflow.",
    createPromptPurposeContract(purpose),
  ]

  if (
    value.mode === "custom_instructions" &&
    value.custom_instructions !== null
  ) {
    sections.push("Administrator instructions:", value.custom_instructions)
  }

  return sections.join("\n\n")
}

function createPromptPurposeContract(purpose: PromptPurpose): string {
  if (purpose === "analysis") {
    return analysisOutputContract
  }
  if (purpose === "generation") {
    return generationDraftOutputContract
  }
  if (purpose === "merge") {
    return "Merge contract: preserve page identity, source references, and existing verified content unless the draft supplies sourced updates."
  }
  if (purpose === "vision_caption") {
    return "Vision caption contract: describe visible image facts only and avoid speculation."
  }
  if (purpose === "knowledge_check") {
    return "Knowledge Check contract: return findings with source evidence, severity, and actionable guidance."
  }

  return "Wiki draft contract: compile externally confirmed notes into source-traceable Wiki candidates."
}

function validatePromptTemplateValue(
  purpose: PromptPurpose,
  value: DatasetPromptTemplateValue,
  t: TFunction
): string | null {
  if (value.built_in_prompt_id !== createBuiltInPromptId(purpose)) {
    return t("kbSettings.promptInvalidBuiltIn")
  }
  if ((value.custom_instructions ?? "").length > 12000) {
    return t("kbSettings.promptCustomInstructionsTooLong")
  }
  if ((value.override_template ?? "").length > 24000) {
    return t("kbSettings.promptOverrideTooLong")
  }
  if (value.mode !== "override_template") {
    return null
  }

  const template = value.override_template?.toLowerCase().trim() ?? ""
  const valid = getRequiredOverrideTerms(purpose).every((terms) =>
    terms.some((term) => template.includes(term))
  )

  return valid ? null : t("kbSettings.promptOverrideMissingContract")
}

function getRequiredOverrideTerms(purpose: PromptPurpose): string[][] {
  const common = [
    ["source"],
    ["trace", "citation", "evidence"],
    ["unsupported", "factual"],
  ]

  if (purpose === "analysis") {
    return [
      ...common,
      ["json"],
      ["entities"],
      ["concepts"],
      ["claims"],
      ["contradictions"],
      ["relationships"],
      ["title"],
      ["summary"],
      ["source_refs"],
      ["locator_refs"],
      ["metadata"],
      ["from_title"],
      ["to_title"],
      ["relation_type"],
      ["evidence"],
    ]
  }
  if (purpose === "generation") {
    return [
      ...common,
      ["json"],
      ["wiki"],
      ["drafts"],
      ["title"],
      ["page_type"],
      ["markdown"],
      ["frontmatter"],
      ["source_refs"],
      ["locator_refs"],
      ["relationship_candidates"],
      ["confidence"],
    ]
  }
  if (purpose === "merge") {
    return [...common, ["preserve"], ["merge"]]
  }
  if (purpose === "vision_caption") {
    return [["image"], ["visible", "fact"], ["unsupported", "speculation"]]
  }
  if (purpose === "knowledge_check") {
    return [...common, ["finding"], ["severity"]]
  }

  return [...common, ["wiki"], ["source_refs"]]
}

function parseOptionalPositiveInteger(
  value: string
): number | null | undefined {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return undefined
  }

  const parsed = Number(trimmed)

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function readRecord(
  value: Record<string, unknown> | undefined,
  key: string
): Record<string, unknown> | undefined {
  const candidate = value?.[key]

  return typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : undefined
}

function readNumber(value: Record<string, unknown> | undefined, key: string) {
  const candidate = value?.[key]

  return typeof candidate === "number" ? candidate : null
}

function displayOptional(value: unknown, fallback: string) {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : fallback
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown

    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function readRetrievalSettings(value: string) {
  const settings = parseJsonObject(value) ?? {}
  const graphExpansion = normalizeSettingsRecord(settings.graph_expansion)

  return {
    contextBudget: readSettingsNumberText(settings.context_budget_tokens),
    graphDepth: readSettingsNumberText(graphExpansion.depth),
    graphLimit: readSettingsNumberText(graphExpansion.limit_per_result),
    mode: readRetrievalModeSetting(settings.mode),
    topK: readSettingsNumberText(settings.top_k),
  }
}

function writeRetrievalSettings(
  value: string,
  patch: RetrievalSettingsPatch
): string {
  const current = parseJsonObject(value) ?? {}
  const graphExpansion = normalizeSettingsRecord(current.graph_expansion)
  const next: Record<string, unknown> = {
    ...current,
    graph_expansion: graphExpansion,
  }

  if (patch.mode !== undefined) {
    next.mode = readRetrievalModeSetting(patch.mode)
  }
  if (patch.topK !== undefined) {
    writeOptionalNumber(next, "top_k", patch.topK)
  }
  if (patch.graphDepth !== undefined) {
    writeOptionalNumber(graphExpansion, "depth", patch.graphDepth)
  }
  if (patch.graphLimit !== undefined) {
    writeOptionalNumber(graphExpansion, "limit_per_result", patch.graphLimit)
  }
  if (patch.contextBudget !== undefined) {
    writeOptionalNumber(next, "context_budget_tokens", patch.contextBudget)
  }

  return JSON.stringify(next, null, 2)
}

function normalizeSettingsRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function readRetrievalModeSetting(value: unknown): string {
  return value === "keyword" ||
    value === "semantic" ||
    value === "graph" ||
    value === "hybrid"
    ? value
    : "hybrid"
}

function readSettingsNumberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : ""
}

function writeOptionalNumber(
  target: Record<string, unknown>,
  key: string,
  value: string
): void {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    delete target[key]
    return
  }

  const parsed = Number(trimmed)

  if (Number.isFinite(parsed)) {
    target[key] = parsed
  }
}

function readNestedValue(
  value: Record<string, unknown> | undefined,
  firstKey: string,
  secondKey: string
): string | number | boolean | null {
  const firstValue = value?.[firstKey]

  if (
    typeof firstValue !== "object" ||
    firstValue === null ||
    Array.isArray(firstValue)
  ) {
    return null
  }

  const secondValue = (firstValue as Record<string, unknown>)[secondKey]

  return typeof secondValue === "string" ||
    typeof secondValue === "number" ||
    typeof secondValue === "boolean"
    ? secondValue
    : null
}

function formatStatus(t: TFunction, value: unknown) {
  if (typeof value !== "string") {
    return t("systemSettings.noValue")
  }

  return t(`status.${value}`, { defaultValue: value })
}

function createFieldId(label: string) {
  return `field-${label.replace(/\s+/gu, "-").toLowerCase()}`
}
