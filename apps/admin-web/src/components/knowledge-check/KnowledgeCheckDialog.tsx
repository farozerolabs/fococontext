import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  knowledgeCheckTypes,
  type KnowledgeCheckResponse,
  type KnowledgeCheckType,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { Button } from "@/components/ui/button.js"
import { Checkbox } from "@/components/ui/checkbox.js"
import { AppDialog as Dialog } from "@/components/state/AppDialog.js"
import { Field, FieldLabel } from "@/components/ui/field.js"
import { Progress } from "@/components/ui/progress.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js"
import { Textarea } from "@/components/ui/textarea.js"

interface KnowledgeCheckDialogProps {
  knowledgeBaseId: string | undefined
  onCompleted?: (result: KnowledgeCheckResponse) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function KnowledgeCheckDialog({
  knowledgeBaseId,
  onCompleted,
  onOpenChange,
  open,
}: KnowledgeCheckDialogProps) {
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<
    "all" | "selectedPages" | "selectedSources"
  >("all")
  const [selectedChecks, setSelectedChecks] = useState<KnowledgeCheckType[]>([
    ...knowledgeCheckTypes,
  ])
  const [pageIdsText, setPageIdsText] = useState("")
  const [sourceDocumentIdsText, setSourceDocumentIdsText] = useState("")
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [result, setResult] = useState<KnowledgeCheckResponse | null>(null)

  const checkMutation = useMutation({
    mutationFn: () => {
      if (knowledgeBaseId === undefined) {
        throw new Error("Knowledge base route parameter is missing.")
      }

      return apiClient.createKnowledgeCheck(knowledgeBaseId, {
        checks: selectedChecks,
        ...(scope === "selectedPages"
          ? { page_ids: readPageIds(pageIdsText) }
          : {}),
        ...(scope === "selectedSources"
          ? { source_document_ids: readPageIds(sourceDocumentIdsText) }
          : {}),
      })
    },
    onSuccess: async (nextResult) => {
      setResult(nextResult)
      setSelectionError(null)
      onCompleted?.(nextResult)
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.knowledgeCheck(nextResult.check_id),
      })
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedChecks.length === 0) {
      setSelectionError(t("knowledgeCheck.selectAtLeastOne"))
      return
    }

    if (scope === "selectedPages" && readPageIds(pageIdsText).length === 0) {
      setSelectionError(t("knowledgeCheck.enterPageIds"))
      return
    }
    if (
      scope === "selectedSources" &&
      readPageIds(sourceDocumentIdsText).length === 0
    ) {
      setSelectionError(t("knowledgeCheck.enterSourceDocumentIds"))
      return
    }

    setSelectionError(null)
    checkMutation.mutate()
  }

  function toggleCheck(type: KnowledgeCheckType, checked: boolean) {
    setSelectedChecks((current) =>
      checked
        ? [...new Set([...current, type])]
        : current.filter((item) => item !== type)
    )
  }

  return (
    <Dialog
      footer={
        <>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("action.close")}
          </Button>
          <Button
            disabled={checkMutation.isPending}
            form="knowledge-check-form"
            type="submit"
          >
            {checkMutation.isPending
              ? t("status.running")
              : t("knowledgeCheck.runCheck")}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t("knowledgeCheck.title")}
    >
      <form
        className="flex flex-col gap-5"
        id="knowledge-check-form"
        onSubmit={handleSubmit}
      >
        <Field>
          <FieldLabel>{t("knowledgeCheck.scope")}</FieldLabel>
          <Select
            onValueChange={(value) =>
              setScope(value as "all" | "selectedPages" | "selectedSources")
            }
            value={scope}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("knowledgeCheck.scopeAllPages")}
              </SelectItem>
              <SelectItem value="selectedPages">
                {t("knowledgeCheck.scopeSelectedPages")}
              </SelectItem>
              <SelectItem value="selectedSources">
                {t("knowledgeCheck.scopeSelectedSources")}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {scope === "selectedPages" ? (
          <Field>
            <FieldLabel>{t("knowledgeCheck.pageIds")}</FieldLabel>
            <Textarea
              className="min-h-24 font-mono"
              onChange={(event) => setPageIdsText(event.currentTarget.value)}
              value={pageIdsText}
            />
          </Field>
        ) : null}
        {scope === "selectedSources" ? (
          <Field>
            <FieldLabel>{t("knowledgeCheck.sourceDocumentIds")}</FieldLabel>
            <Textarea
              className="min-h-24 font-mono"
              onChange={(event) =>
                setSourceDocumentIdsText(event.currentTarget.value)
              }
              value={sourceDocumentIdsText}
            />
          </Field>
        ) : null}

        <fieldset className="flex flex-col gap-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            {t("knowledgeCheck.items")}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {knowledgeCheckTypes.map((type) => {
              const checkboxId = `knowledge-check-${type}`

              return (
                <Field
                  className="items-center gap-2"
                  key={type}
                  orientation="horizontal"
                >
                  <Checkbox
                    checked={selectedChecks.includes(type)}
                    id={checkboxId}
                    onCheckedChange={(checked) =>
                      toggleCheck(type, checked === true)
                    }
                  />
                  <FieldLabel htmlFor={checkboxId}>
                    {t(`knowledgeCheck.type.${type}`)}
                  </FieldLabel>
                </Field>
              )
            })}
          </div>
        </fieldset>

        {selectionError === null ? null : (
          <div className="text-sm text-destructive" role="alert">
            {selectionError}
          </div>
        )}
        {checkMutation.isError ? (
          <ErrorAlert title={t("state.loadFailed")} />
        ) : null}
        {result === null ? null : <KnowledgeCheckResult result={result} />}
      </form>
    </Dialog>
  )
}

function KnowledgeCheckResult({ result }: { result: KnowledgeCheckResponse }) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
      <h3 className="font-medium">{t("knowledgeCheck.latestRun")}</h3>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Metric label={t("knowledgeCheck.checkId")}>
          <ResourceIdDisplay resourceId={result.check_id} />
        </Metric>
        <Metric label={t("source.column.status")}>
          {t(`status.${result.status}`)}
        </Metric>
        <Metric label={t("knowledgeCheck.findings")}>
          {result.findings.length}
        </Metric>
        {result.semantic_run === undefined ? null : (
          <>
            <Metric label={t("knowledgeCheck.semanticRun")}>
              {t(`status.${result.semantic_run.status}`)}
            </Metric>
            <Metric label={t("knowledgeCheck.model")}>
              {result.semantic_run.model ?? t("source.notAvailable")}
            </Metric>
            <Metric label={t("knowledgeCheck.repairAttempts")}>
              {result.semantic_run.repair_attempts}
            </Metric>
          </>
        )}
      </div>
      <Progress label={t(`status.${result.status}`)} value={result.progress} />
      <DetailList
        items={result.findings.map((finding) =>
          [
            t(`knowledgeCheck.type.${finding.type}`),
            t(`knowledgeCheck.severity.${finding.severity}`),
            finding.page_id ?? t("source.notAvailable"),
            finding.confidence === undefined
              ? t("source.notAvailable")
              : String(finding.confidence),
            finding.message,
          ].join(" | ")
        )}
        title={t("knowledgeCheck.results")}
      />
      <DetailList
        items={result.findings.flatMap(
          (finding) => finding.affected_object_ids ?? []
        )}
        title={t("knowledgeCheck.affectedObjects")}
      />
      <DetailList
        items={result.findings.flatMap((finding) =>
          (finding.evidence ?? []).map((evidence) => JSON.stringify(evidence))
        )}
        title={t("knowledgeCheck.evidence")}
      />
      <DetailList
        items={result.findings.flatMap((finding) =>
          (finding.source_refs ?? []).map((sourceRef) =>
            JSON.stringify(sourceRef)
          )
        )}
        title={t("knowledgeCheck.sourceRefs")}
      />
      <DetailList
        items={result.findings.flatMap((finding) =>
          finding.suggested_action === undefined
            ? []
            : [JSON.stringify(finding.suggested_action)]
        )}
        title={t("knowledgeCheck.suggestedActions")}
      />
      <DetailList
        items={[JSON.stringify(result.configuration_snapshot, null, 2)]}
        title={t("knowledgeCheck.configurationSnapshot")}
      />
    </section>
  )
}

function Metric({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function DetailList({ items, title }: { items: string[]; title: string }) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("source.notAvailable")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((item, index) => (
            <li
              className="rounded-md border bg-background px-2 py-1"
              key={`${title}-${index}`}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function readPageIds(value: string) {
  return value
    .split(/[,\n]/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
