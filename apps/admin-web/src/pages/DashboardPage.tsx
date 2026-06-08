import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Copy,
  Edit2,
  History,
  MoreHorizontal,
  Settings,
  Trash2,
} from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router"

import {
  type CreateKnowledgeBaseInput,
  type KnowledgeBase,
  type KnowledgeBaseOutputLanguage,
  type KnowledgeBaseStatus,
  type KnowledgeBaseTemplate,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import { formatResourceId } from "@/components/resource-id/resource-id.js"
import {
  IdeExplorerPagination,
  ideExplorerPageSize,
  normalizeIdeExplorerPage,
} from "@/components/ide/IdeWorkspace.js"
import { DangerousAction } from "@/components/state/DangerousAction.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import { showToast } from "@/components/ui/toast.js"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js"
import { AppDialog as Dialog } from "@/components/state/AppDialog.js"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.js"
import { FilterInput } from "@/components/ui/filter.js"
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

export function DashboardPage() {
  const { i18n, t } = useTranslation()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const knowledgeBasesPage = readSearchPage(searchParams, "knowledge_base_page")
  const knowledgeBasesListOptions = {
    page: knowledgeBasesPage,
    pageSize: ideExplorerPageSize,
  }
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<KnowledgeBase | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | KnowledgeBaseStatus>(
    "all"
  )
  const [templateFilter, setTemplateFilter] = useState<
    "all" | KnowledgeBaseTemplate
  >("all")

  const knowledgeBasesQuery = useQuery({
    queryKey: adminQueryKeys.knowledgeBases(knowledgeBasesListOptions),
    queryFn: () => apiClient.listKnowledgeBases(knowledgeBasesListOptions),
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateKnowledgeBaseInput) =>
      apiClient.createKnowledgeBase(input),
    onSuccess: async (createdKnowledgeBase) => {
      setCreateOpen(false)
      queryClient.setQueryData<KnowledgeBaseListCache>(
        adminQueryKeys.knowledgeBases(),
        (current) => upsertKnowledgeBaseList(current, createdKnowledgeBase)
      )
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.knowledgeBases(),
      })
      queryClient.setQueryData<KnowledgeBaseListCache>(
        adminQueryKeys.knowledgeBases(),
        (current) => upsertKnowledgeBaseList(current, createdKnowledgeBase)
      )
    },
  })

  const renameMutation = useMutation({
    mutationFn: (input: { description?: string; id: string; name?: string }) =>
      apiClient.updateKnowledgeBase(input.id, {
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.name === undefined ? {} : { name: input.name }),
      }),
    onSuccess: async () => {
      setRenameTarget(null)
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.knowledgeBases(),
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteKnowledgeBase(id),
    onSuccess: async (result) => {
      setDeleteTarget(null)
      queryClient.setQueryData<KnowledgeBaseListCache>(
        adminQueryKeys.knowledgeBases(),
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                data: current.data.filter(
                  (knowledgeBase) => knowledgeBase.id !== result.id
                ),
              }
      )
      showToast({
        message: t("cleanup.deleteQueued", {
          operationId: result.cleanup_operation.id,
        }),
      })
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.knowledgeBases(),
      })
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.cleanupOperations(),
      })
    },
  })

  const knowledgeBases = useMemo(
    () => knowledgeBasesQuery.data?.data ?? [],
    [knowledgeBasesQuery.data?.data]
  )
  const knowledgeBasesPagination =
    knowledgeBasesQuery.data?.pagination ??
    createEmptyPagination(knowledgeBasesPage)
  const normalizedKnowledgeBasesPage = normalizeIdeExplorerPage(
    knowledgeBasesPagination.page,
    knowledgeBasesPagination.total,
    knowledgeBasesPagination.page_size || ideExplorerPageSize
  )
  const filteredKnowledgeBases = useMemo(
    () =>
      knowledgeBases.filter((knowledgeBase) => {
        const normalizedQuery = searchQuery.trim().toLowerCase()
        const matchesSearch =
          normalizedQuery.length === 0 ||
          [
            knowledgeBase.name,
            knowledgeBase.description ?? "",
            knowledgeBase.id,
            knowledgeBase.slug,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        const matchesStatus =
          statusFilter === "all" ? true : knowledgeBase.status === statusFilter
        const matchesTemplate =
          templateFilter === "all"
            ? true
            : knowledgeBase.template === templateFilter

        return matchesSearch && matchesStatus && matchesTemplate
      }),
    [knowledgeBases, searchQuery, statusFilter, templateFilter]
  )

  function updateKnowledgeBasesPage(page: number) {
    const next = new URLSearchParams(searchParams)
    next.set("knowledge_base_page", String(page))
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-5 p-6" data-route-id="dashboard">
      <h1 className="sr-only">{t("nav.dashboard")}</h1>

      {knowledgeBasesQuery.isLoading ? (
        <LoadingState label={t("state.loading")} />
      ) : null}
      {knowledgeBasesQuery.isError ? (
        <ErrorAlert title={t("state.loadFailed")} />
      ) : null}
      {knowledgeBasesQuery.isSuccess && knowledgeBases.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => setCreateOpen(true)} type="button">
              {t("action.createKnowledgeBase")}
            </Button>
          }
          title={t("empty.noKnowledgeBases")}
        />
      ) : null}
      {knowledgeBases.length > 0 ? (
        <Card className="py-4">
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
            <FilterInput
              label={t("dashboard.searchKnowledgeBases")}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder={t("dashboard.searchKnowledgeBases")}
              value={searchQuery}
            />
            <Field className="gap-1.5">
              <FieldLabel htmlFor="knowledge-base-status-filter">
                {t("dashboard.statusFilter")}
              </FieldLabel>
              <Select
                onValueChange={(value) =>
                  setStatusFilter(value as "all" | KnowledgeBaseStatus)
                }
                value={statusFilter}
              >
                <SelectTrigger
                  className="w-full md:w-44"
                  id="knowledge-base-status-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("dashboard.allStatuses")}
                    </SelectItem>
                    <SelectItem value="ready">{t("status.ready")}</SelectItem>
                    <SelectItem value="indexing">
                      {t("status.indexing")}
                    </SelectItem>
                    <SelectItem value="outdated">
                      {t("status.outdated")}
                    </SelectItem>
                    <SelectItem value="failed">{t("status.failed")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="knowledge-base-template-filter">
                {t("dashboard.templateFilter")}
              </FieldLabel>
              <Select
                onValueChange={(value) =>
                  setTemplateFilter(value as "all" | KnowledgeBaseTemplate)
                }
                value={templateFilter}
              >
                <SelectTrigger
                  className="w-full md:w-52"
                  id="knowledge-base-template-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("dashboard.allTemplates")}
                    </SelectItem>
                    <SelectItem value="general">
                      {t("template.general")}
                    </SelectItem>
                    <SelectItem value="research">
                      {t("template.research")}
                    </SelectItem>
                    <SelectItem value="team_knowledge">
                      {t("template.teamKnowledge")}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="md:ml-auto">
              <Button onClick={() => setCreateOpen(true)} type="button">
                {t("action.createKnowledgeBase")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {knowledgeBases.length > 0 && filteredKnowledgeBases.length === 0 ? (
        <EmptyState title={t("empty.noResults")} />
      ) : null}
      {filteredKnowledgeBases.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredKnowledgeBases.map((knowledgeBase) => (
              <KnowledgeBaseCard
                formatDate={(value) => formatDate(value, i18n.language)}
                key={knowledgeBase.id}
                knowledgeBase={knowledgeBase}
                onDelete={() => setDeleteTarget(knowledgeBase)}
                onRename={() => setRenameTarget(knowledgeBase)}
              />
            ))}
          </div>
          <IdeExplorerPagination
            onPageChange={updateKnowledgeBasesPage}
            page={normalizedKnowledgeBasesPage}
            pageSize={knowledgeBasesPagination.page_size || ideExplorerPageSize}
            total={knowledgeBasesPagination.total}
          />
        </>
      ) : null}

      <KnowledgeBaseFormDialog
        isSubmitting={createMutation.isPending}
        includeConfiguration
        onOpenChange={setCreateOpen}
        onSubmit={(input) => createMutation.mutate(input)}
        open={createOpen}
        title={t("action.createKnowledgeBase")}
      />

      <KnowledgeBaseFormDialog
        isSubmitting={renameMutation.isPending}
        onOpenChange={(open) => setRenameTarget(open ? renameTarget : null)}
        onSubmit={(input) => {
          if (renameTarget !== null) {
            renameMutation.mutate({ id: renameTarget.id, ...input })
          }
        }}
        open={renameTarget !== null}
        title={t("action.rename")}
        {...(renameTarget === null ? {} : { initialValue: renameTarget })}
      />

      <DangerousAction
        cancelLabel={t("action.cancel")}
        confirmLabel={t("action.delete")}
        description={t("dashboard.deleteKnowledgeBaseDescription")}
        onConfirm={() => {
          if (deleteTarget !== null) {
            deleteMutation.mutate(deleteTarget.id)
          }
        }}
        onOpenChange={(open) => setDeleteTarget(open ? deleteTarget : null)}
        open={deleteTarget !== null}
        title={t("dashboard.deleteKnowledgeBase")}
      />
    </div>
  )
}

function createEmptyPagination(page: number) {
  return {
    has_more: false,
    page,
    page_size: ideExplorerPageSize,
    total: 0,
  }
}

function readSearchPage(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key))

  return Number.isSafeInteger(value) && value > 0 ? value : 1
}

interface KnowledgeBaseListCache {
  data: KnowledgeBase[]
  pagination: {
    has_more: boolean
    page: number
    page_size: number
    total: number
  }
}

function upsertKnowledgeBaseList(
  current: KnowledgeBaseListCache | undefined,
  knowledgeBase: KnowledgeBase
): KnowledgeBaseListCache {
  const currentData = current?.data ?? []
  const nextData = [
    knowledgeBase,
    ...currentData.filter((item) => item.id !== knowledgeBase.id),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return {
    data: nextData,
    pagination: {
      has_more: current?.pagination.has_more ?? false,
      page: current?.pagination.page ?? 1,
      page_size: current?.pagination.page_size ?? Math.max(nextData.length, 20),
      total: Math.max(current?.pagination.total ?? 0, nextData.length),
    },
  }
}

interface KnowledgeBaseCardProps {
  formatDate: (value: string) => string
  knowledgeBase: KnowledgeBase
  onDelete: () => void
  onRename: () => void
}

function KnowledgeBaseCard({
  formatDate,
  knowledgeBase,
  onDelete,
  onRename,
}: KnowledgeBaseCardProps) {
  const { t } = useTranslation()

  async function copyResourceId(resourceId: string) {
    await navigator.clipboard.writeText(resourceId)
    showToast({ message: t("resourceId.copied") })
  }

  return (
    <Card
      aria-label={knowledgeBase.name}
      className="group relative overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-ring/40 hover:bg-muted/40"
      role="article"
    >
      <Link
        aria-label={t("knowledgeBase.openAria", {
          name: knowledgeBase.name,
        })}
        className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
        to={`/knowledge-bases/${knowledgeBase.id}/overview`}
      />
      <CardHeader className="pointer-events-none relative gap-2">
        <CardTitle className="truncate text-base">
          {knowledgeBase.name}
        </CardTitle>
        <CardDescription className="line-clamp-2 min-h-9">
          {knowledgeBase.description}
        </CardDescription>
        <CardAction>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <Badge variant="outline">
              {t(`status.${knowledgeBase.status}`)}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("knowledgeBase.cardActionsAria", {
                    name: knowledgeBase.name,
                  })}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() => void copyResourceId(knowledgeBase.id)}
                  >
                    <Copy aria-hidden="true" />
                    {t("action.copyId")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void copyResourceId(knowledgeBase.current_version_id)
                    }
                  >
                    <Copy aria-hidden="true" />
                    {t("action.copyVersionId")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link to={`/knowledge-bases/${knowledgeBase.id}/settings`}>
                      <Settings aria-hidden="true" />
                      {t("nav.settings")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`/knowledge-bases/${knowledgeBase.id}/versions`}>
                      <History aria-hidden="true" />
                      {t("action.versionHistory")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      onRename()
                    }}
                  >
                    <Edit2 aria-hidden="true" />
                    {t("action.rename")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    onDelete()
                  }}
                  variant="destructive"
                >
                  <Trash2 aria-hidden="true" />
                  {t("action.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="pointer-events-none relative grid gap-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">{t("knowledgeBase.slug")}</span>
          <code className="truncate font-mono text-foreground">
            {knowledgeBase.slug}
          </code>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">{t("knowledgeBase.id")}</span>
          <code
            className="truncate font-mono text-foreground"
            title={knowledgeBase.id}
          >
            {formatResourceId(knowledgeBase.id)}
          </code>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">{t("knowledgeBase.currentVersion")}</span>
          <code
            className="truncate font-mono text-foreground"
            title={knowledgeBase.current_version_id}
          >
            {formatResourceId(knowledgeBase.current_version_id)}
          </code>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">{t("knowledgeBase.template")}</span>
          <span className="truncate text-foreground">
            {t(`template.${knowledgeBase.template}`)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">{t("knowledgeBase.outputLanguage")}</span>
          <span className="truncate text-foreground">
            {t(`outputLanguage.${knowledgeBase.output_language}`)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">{t("knowledgeBase.updatedAt")}</span>
          <time
            className="truncate text-foreground"
            dateTime={knowledgeBase.updated_at}
          >
            {formatDate(knowledgeBase.updated_at)}
          </time>
        </div>
      </CardContent>
    </Card>
  )
}

interface KnowledgeBaseFormDialogProps {
  initialValue?: KnowledgeBase
  includeConfiguration?: boolean
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateKnowledgeBaseInput) => void
  open: boolean
  title: string
}

function KnowledgeBaseFormDialog({
  initialValue,
  includeConfiguration = false,
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
  title,
}: KnowledgeBaseFormDialogProps) {
  const { t } = useTranslation()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const description = String(formData.get("description") ?? "").trim()
    const template = String(
      formData.get("template") ?? "general"
    ) as KnowledgeBaseTemplate
    const outputLanguage = String(
      formData.get("outputLanguage") ?? "auto"
    ) as KnowledgeBaseOutputLanguage

    onSubmit({
      ...(description.length === 0 ? {} : { description }),
      ...(name.length === 0 ? {} : { name }),
      ...(includeConfiguration
        ? { output_language: outputLanguage, template }
        : {}),
    })
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
            {t("action.cancel")}
          </Button>
          <Button
            disabled={isSubmitting}
            form="knowledge-base-form"
            type="submit"
          >
            {isSubmitting ? t("status.running") : t("action.save")}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    >
      <form id="knowledge-base-form" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="knowledge-base-name">
              {t("knowledgeBase.name")}
            </FieldLabel>
            <Input
              defaultValue={initialValue?.name}
              id="knowledge-base-name"
              name="name"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="knowledge-base-description">
              {t("knowledgeBase.description")}
            </FieldLabel>
            <Textarea
              className="min-h-20"
              defaultValue={initialValue?.description}
              id="knowledge-base-description"
              name="description"
            />
          </Field>
          {includeConfiguration ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("knowledgeBase.template")}</FieldLabel>
                <Select
                  defaultValue={initialValue?.template ?? "general"}
                  name="template"
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">
                      {t("template.general")}
                    </SelectItem>
                    <SelectItem value="research">
                      {t("template.research")}
                    </SelectItem>
                    <SelectItem value="team_knowledge">
                      {t("template.teamKnowledge")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t("knowledgeBase.outputLanguage")}</FieldLabel>
                <Select
                  defaultValue={initialValue?.output_language ?? "auto"}
                  name="outputLanguage"
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      {t("outputLanguage.auto")}
                    </SelectItem>
                    <SelectItem value="en-US">
                      {t("outputLanguage.en-US")}
                    </SelectItem>
                    <SelectItem value="zh-CN">
                      {t("outputLanguage.zh-CN")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}
        </FieldGroup>
      </form>
    </Dialog>
  )
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
