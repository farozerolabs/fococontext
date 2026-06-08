import { X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  createPaginationWindow,
} from "@/components/ui/pagination.js"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js"
import { cn } from "@/lib/utils.js"

export interface InspectorTab {
  content: ReactNode
  id: string
  label: string
}

export type WorkbenchPanelTab = InspectorTab

const bottomPanelDefaultHeight = 288
const bottomPanelMinHeight = 192
const bottomPanelKeyboardResizeStep = 24
const bottomPanelMaxRatio = 0.5

export const ideExplorerPageSize = 50

export function IdeWorkspace({
  detail,
  explorer,
}: {
  detail: ReactNode
  explorer: ReactNode
}) {
  return (
    <div className="grid h-[calc(100dvh-5rem)] overflow-hidden bg-background lg:grid-cols-[20rem_minmax(0,1fr)]">
      {explorer}
      {detail}
    </div>
  )
}

export function IdeExplorer({
  actions,
  children,
}: {
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <aside className="border-b bg-muted/20 lg:border-r lg:border-b-0">
      <div className="max-h-[36rem] overflow-auto p-2 lg:max-h-[calc(100dvh-8rem)]">
        {actions === undefined ? null : (
          <div className="sticky top-0 mb-2 flex items-center justify-end gap-1 bg-background/95 py-1 backdrop-blur">
            {actions}
          </div>
        )}
        {children}
      </div>
    </aside>
  )
}

export function IdeExplorerGroup({
  children,
  count,
  title,
}: {
  children: ReactNode
  count?: number
  title: string
}) {
  return (
    <section className="flex flex-col gap-1 py-1">
      <div className="flex h-7 items-center justify-between px-2 text-xs font-medium text-muted-foreground uppercase">
        <span>{title}</span>
        {count === undefined ? null : (
          <span className="font-mono">{count}</span>
        )}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  )
}

export interface IdeExplorerCategory {
  content: ReactNode
  count: number
  id: string
  label: string
}

export function IdeExplorerCategoryTabs({
  ariaLabel,
  categories,
  onValueChange,
  value,
}: {
  ariaLabel: string
  categories: readonly IdeExplorerCategory[]
  onValueChange: (value: string) => void
  value: string
}) {
  const activeCategory =
    categories.find((category) => category.id === value) ?? categories[0]

  if (activeCategory === undefined) {
    return null
  }

  if (categories.length <= 1) {
    return <>{activeCategory.content}</>
  }

  return (
    <Tabs onValueChange={onValueChange} value={activeCategory.id}>
      <div className="sticky top-0 mb-2 bg-background/95 py-1 backdrop-blur">
        <TabsList
          aria-label={ariaLabel}
          className="grid h-auto w-full auto-cols-fr grid-flow-col"
        >
          {categories.map((category) => (
            <TabsTrigger
              className="min-w-0 gap-1 px-2"
              key={category.id}
              value={category.id}
            >
              <span className="truncate">{category.label}</span>
              <Badge className="shrink-0" variant="secondary">
                {category.count}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {categories.map((category) => (
        <TabsContent className="mt-0" key={category.id} value={category.id}>
          {category.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export function IdeExplorerPagination({
  onPageChange,
  page,
  pageSize = ideExplorerPageSize,
  total,
}: {
  onPageChange: (page: number) => void
  page: number
  pageSize?: number
  total: number
}) {
  const totalPages = getIdeExplorerTotalPages(total, pageSize)

  if (totalPages <= 1) {
    return null
  }

  const currentPage = normalizeIdeExplorerPage(page, total, pageSize)
  const pages = createPaginationWindow({
    currentPage,
    totalPages,
    windowSize: 3,
  })

  return (
    <Pagination className="mt-2 justify-start">
      <PaginationContent className="w-full justify-between">
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={currentPage <= 1}
            className={cn(currentPage <= 1 && "pointer-events-none opacity-50")}
            href="#"
            onClick={(event) => {
              event.preventDefault()
              onPageChange(Math.max(1, currentPage - 1))
            }}
            text=""
          />
        </PaginationItem>
        <span className="flex items-center gap-0.5">
          {pages.map((item) => (
            <PaginationItem key={item}>
              <PaginationLink
                href="#"
                isActive={item === currentPage}
                onClick={(event) => {
                  event.preventDefault()
                  onPageChange(item)
                }}
                size="icon-sm"
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ))}
        </span>
        <PaginationItem>
          <PaginationNext
            aria-disabled={currentPage >= totalPages}
            className={cn(
              currentPage >= totalPages && "pointer-events-none opacity-50"
            )}
            href="#"
            onClick={(event) => {
              event.preventDefault()
              onPageChange(Math.min(totalPages, currentPage + 1))
            }}
            text=""
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

export function getIdeExplorerTotalPages(
  total: number,
  pageSize = ideExplorerPageSize
) {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function normalizeIdeExplorerPage(
  page: number,
  total: number,
  pageSize = ideExplorerPageSize
) {
  return Math.min(Math.max(page, 1), getIdeExplorerTotalPages(total, pageSize))
}

export function IdeExplorerItem({
  active,
  children,
  meta,
  onSelect,
  status,
  subtitle,
  title,
}: {
  active?: boolean
  children?: ReactNode
  meta?: string | undefined
  onSelect: () => void
  status?: string | undefined
  subtitle?: string | undefined
  title: string
}) {
  return (
    <Button
      aria-current={active === true ? "true" : undefined}
      className={cn(
        "grid h-auto w-full justify-stretch gap-1 rounded-md px-2 py-2 text-left text-sm",
        active === true ? "bg-muted text-foreground" : "text-foreground"
      )}
      onClick={onSelect}
      type="button"
      variant="ghost"
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-medium">{title}</span>
        {status === undefined ? null : (
          <Badge className="shrink-0" variant="secondary">
            {status}
          </Badge>
        )}
      </span>
      {subtitle === undefined ? null : (
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      )}
      {meta === undefined ? null : (
        <span className="truncate font-mono text-xs text-muted-foreground">
          {meta}
        </span>
      )}
      {children}
    </Button>
  )
}

export function IdeWorkbenchDetailPanel({
  actions,
  bottomPanelAriaLabel,
  bottomPanelCloseLabel,
  bottomPanelDefaultOpen = true,
  bottomPanelFloatingCloseLabel,
  bottomPanelClassName,
  bottomPanelOpenLabel,
  bottomPanelResizeLabel,
  bottomPanelStateKey,
  bottomTabs,
  contentClassName,
  contentTestId,
  primary,
  subtitle,
  testId,
  title,
}: {
  actions?: ReactNode
  bottomPanelAriaLabel: string
  bottomPanelCloseLabel: string
  bottomPanelDefaultOpen?: boolean
  bottomPanelFloatingCloseLabel?: string
  bottomPanelClassName?: string | undefined
  bottomPanelOpenLabel: string
  bottomPanelResizeLabel?: string
  bottomPanelStateKey?: string | undefined
  bottomTabs?: WorkbenchPanelTab[]
  contentClassName?: string
  contentTestId?: string
  primary: ReactNode
  subtitle?: ReactNode
  testId?: string
  title: ReactNode
}) {
  const tabs = useMemo(() => bottomTabs ?? [], [bottomTabs])
  const containerRef = useRef<HTMLElement>(null)
  const [bottomPanelState, setBottomPanelState] = useState({
    key: bottomPanelStateKey,
    open: bottomPanelDefaultOpen,
  })
  const [bottomPanelHeight, setBottomPanelHeight] = useState(
    bottomPanelDefaultHeight
  )
  const [bottomPanelMaxHeight, setBottomPanelMaxHeight] = useState(
    bottomPanelDefaultHeight
  )
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? "")
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const bottomPanelOpen =
    bottomPanelState.key === bottomPanelStateKey
      ? bottomPanelState.open
      : bottomPanelDefaultOpen

  useEffect(() => {
    setBottomPanelState({
      key: bottomPanelStateKey,
      open: bottomPanelDefaultOpen,
    })
  }, [bottomPanelDefaultOpen, bottomPanelStateKey])

  useEffect(() => {
    if (tabs.length > 0 && tabs.every((tab) => tab.id !== activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? "")
    }
  }, [activeTabId, tabs])

  const getBottomPanelMaxHeight = useCallback(() => {
    const containerHeight = containerRef.current?.clientHeight ?? 0

    if (containerHeight <= 0) {
      return bottomPanelDefaultHeight
    }

    return Math.max(
      bottomPanelMinHeight,
      Math.floor(containerHeight * bottomPanelMaxRatio)
    )
  }, [])

  const clampBottomPanelHeight = useCallback(
    (height: number, maxHeight = bottomPanelMaxHeight) =>
      Math.min(Math.max(height, bottomPanelMinHeight), maxHeight),
    [bottomPanelMaxHeight]
  )

  const updateBottomPanelHeight = useCallback(
    (height: number) => {
      const maxHeight = getBottomPanelMaxHeight()
      setBottomPanelMaxHeight(maxHeight)
      setBottomPanelHeight(clampBottomPanelHeight(height, maxHeight))
    },
    [clampBottomPanelHeight, getBottomPanelMaxHeight]
  )

  useEffect(() => {
    if (!bottomPanelOpen) {
      return
    }

    setBottomPanelMaxHeight(getBottomPanelMaxHeight())
  }, [bottomPanelOpen, getBottomPanelMaxHeight])

  const handleBottomPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)

      const startY = event.clientY
      const startHeight = bottomPanelHeight

      const handlePointerMove = (moveEvent: PointerEvent) => {
        updateBottomPanelHeight(startHeight + startY - moveEvent.clientY)
      }

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
        window.removeEventListener("pointercancel", handlePointerUp)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
      window.addEventListener("pointercancel", handlePointerUp)
    },
    [bottomPanelHeight, updateBottomPanelHeight]
  )

  const handleBottomPanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowUp") {
        event.preventDefault()
        updateBottomPanelHeight(
          bottomPanelHeight + bottomPanelKeyboardResizeStep
        )
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        updateBottomPanelHeight(
          bottomPanelHeight - bottomPanelKeyboardResizeStep
        )
      }
      if (event.key === "Home") {
        event.preventDefault()
        updateBottomPanelHeight(bottomPanelMinHeight)
      }
      if (event.key === "End") {
        event.preventDefault()
        updateBottomPanelHeight(getBottomPanelMaxHeight())
      }
    },
    [bottomPanelHeight, getBottomPanelMaxHeight, updateBottomPanelHeight]
  )

  return (
    <section
      ref={containerRef}
      className="relative flex h-[calc(100dvh-5rem)] min-w-0 flex-col overflow-hidden"
      data-testid={testId}
    >
      <div className="z-10 flex min-h-12 shrink-0 flex-col gap-2 border-b bg-background px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {subtitle === undefined ? null : (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        {actions === undefined && tabs.length === 0 ? null : (
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
            {actions}
            {tabs.length === 0 ? null : (
              <Button
                aria-expanded={bottomPanelOpen}
                aria-label={
                  bottomPanelOpen ? bottomPanelCloseLabel : bottomPanelOpenLabel
                }
                onClick={() =>
                  setBottomPanelState({
                    key: bottomPanelStateKey,
                    open: !bottomPanelOpen,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {bottomPanelOpen ? bottomPanelCloseLabel : bottomPanelOpenLabel}
              </Button>
            )}
          </div>
        )}
      </div>
      <div
        className={cn("min-h-0 flex-1 overflow-auto p-4", contentClassName)}
        data-testid={contentTestId}
      >
        {primary}
      </div>
      {tabs.length === 0 ||
      activeTab === undefined ||
      !bottomPanelOpen ? null : (
        <div
          className={cn(
            "absolute inset-x-3 bottom-3 z-20 max-h-[50%] min-h-48 overflow-hidden rounded-lg border bg-background/98 shadow-2xl ring-1 shadow-slate-950/20 ring-border/60 backdrop-blur",
            bottomPanelClassName
          )}
          style={{ height: bottomPanelHeight }}
        >
          <div
            aria-label={bottomPanelResizeLabel ?? bottomPanelAriaLabel}
            aria-orientation="horizontal"
            aria-valuemax={bottomPanelMaxHeight}
            aria-valuemin={bottomPanelMinHeight}
            aria-valuenow={Math.round(
              clampBottomPanelHeight(bottomPanelHeight)
            )}
            className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize touch-none"
            onKeyDown={handleBottomPanelResizeKeyDown}
            onPointerDown={handleBottomPanelResizeStart}
            role="separator"
            tabIndex={0}
          />
          <Tabs
            className="flex h-full min-h-0 flex-col"
            onValueChange={setActiveTabId}
            value={activeTab.id}
          >
            <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b px-3 py-1">
              <TabsList
                aria-label={bottomPanelAriaLabel}
                className="h-auto max-w-full min-w-0 justify-start overflow-x-auto rounded-none bg-transparent p-0"
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    className="h-auto flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-3 py-2 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                    key={tab.id}
                    value={tab.id}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                aria-label={
                  bottomPanelFloatingCloseLabel ?? bottomPanelCloseLabel
                }
                onClick={() =>
                  setBottomPanelState({
                    key: bottomPanelStateKey,
                    open: false,
                  })
                }
                size="icon-sm"
                title={bottomPanelFloatingCloseLabel ?? bottomPanelCloseLabel}
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {tabs.map((tab) => (
                <TabsContent
                  className="mt-0 min-h-44 p-4"
                  key={tab.id}
                  value={tab.id}
                >
                  {tab.content}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>
      )}
    </section>
  )
}

export function IdeDetailPanel({
  actions,
  children,
  contentTestId,
  subtitle,
  testId,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  contentTestId?: string
  subtitle?: ReactNode
  testId?: string
  title: ReactNode
}) {
  return (
    <section className="min-w-0" data-testid={testId}>
      <div className="flex min-h-12 flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {subtitle === undefined ? null : (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex max-w-full shrink-0 flex-wrap gap-2">
            {actions}
          </div>
        )}
      </div>
      <div
        className="max-h-[calc(100dvh-8rem)] overflow-auto p-4"
        data-testid={contentTestId}
      >
        {children}
      </div>
    </section>
  )
}

export function InspectorTabs({
  ariaLabel,
  tabs,
}: {
  ariaLabel: string
  tabs: InspectorTab[]
}) {
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? "")
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]

  useEffect(() => {
    if (tabs.length > 0 && tabs.every((tab) => tab.id !== activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? "")
    }
  }, [activeTabId, tabs])

  if (tabs.length === 0 || activeTab === undefined) {
    return null
  }

  return (
    <Tabs className="gap-4" onValueChange={setActiveTabId} value={activeTab.id}>
      <TabsList
        aria-label={ariaLabel}
        className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            className="h-auto flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-3 py-2 shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            key={tab.id}
            value={tab.id}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent className="mt-0" key={tab.id} value={tab.id}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export function InspectorSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

export function InspectorGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>
}

export function InspectorField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="break-words">{children}</div>
    </div>
  )
}

export function InspectorJson({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-md border bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}
