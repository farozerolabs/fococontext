import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSigma,
} from "@react-sigma/core"
import { useQuery } from "@tanstack/react-query"
import { MultiDirectedGraph } from "graphology"
import * as forceAtlas2 from "graphology-layout-forceatlas2"
import type {
  ForceAtlas2Settings,
  ForceAtlas2SynchronousLayoutParameters,
} from "graphology-layout-forceatlas2"
import { Download, ListChecks, Maximize2, ZoomIn, ZoomOut } from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router"
import type { NodeHoverDrawingFunction } from "sigma/rendering"
import type { SigmaEdgeEventPayload, SigmaNodeEventPayload } from "sigma/types"
import "@react-sigma/core/lib/style.css"

import {
  type GraphEdge,
  type GraphInsightItem,
  type GraphInsightsResponse,
  type GraphInsightStatus,
  type GraphNode,
  type GraphResponse,
} from "@/api/fococontext-client.js"
import { useApiClient } from "@/api/api-client-context.js"
import { adminQueryKeys } from "@/api/query-keys.js"
import {
  IdeWorkbenchDetailPanel,
  InspectorField,
  InspectorGrid,
  InspectorJson,
  InspectorSection,
} from "@/components/ide/IdeWorkspace.js"
import { KnowledgeCheckDialog } from "@/components/knowledge-check/KnowledgeCheckDialog.js"
import { ResourceIdDisplay } from "@/components/resource-id/ResourceIdDisplay.js"
import { EmptyState } from "@/components/state/EmptyState.js"
import { ErrorAlert } from "@/components/state/ErrorAlert.js"
import { LoadingState } from "@/components/state/LoadingState.js"
import { Badge } from "@/components/ui/badge.js"
import { Button } from "@/components/ui/button.js"
import { cn } from "@/lib/utils.js"

export type GraphSelection =
  | {
      kind: "edge"
      value: GraphEdge
    }
  | {
      kind: "insight"
      value: GraphInsightItem
    }
  | {
      kind: "node"
      value: GraphNode
    }

interface GraphSelectionHighlight {
  selectedEdgeIds: readonly string[]
  selectedNodeIds: readonly string[]
}

interface SigmaGraphNodeAttributes extends Record<string, unknown> {
  graphNode: GraphNode
  color: string
  dimmed?: boolean
  forceLabel?: boolean
  highlighted?: boolean
  hoverDimmed?: boolean
  hoverNeighbor?: boolean
  hovered?: boolean
  label: string
  nodeType: string
  selected?: boolean
  size: number
  x: number
  y: number
}

interface SigmaGraphEdgeAttributes extends Record<string, unknown> {
  graphEdge: GraphEdge
  color: string
  dimmed?: boolean
  forceLabel?: boolean
  highlighted?: boolean
  hoverDimmed?: boolean
  hovered?: boolean
  label: string
  relationType: GraphEdge["relation_type"]
  selected?: boolean
  size: number
  weight: number
}

type SigmaKnowledgeGraph = MultiDirectedGraph<
  SigmaGraphNodeAttributes,
  SigmaGraphEdgeAttributes
>
type ForceAtlas2Runner = {
  assign: (
    graph: SigmaKnowledgeGraph,
    params: ForceAtlas2SynchronousLayoutParameters<
      SigmaGraphNodeAttributes,
      SigmaGraphEdgeAttributes
    >
  ) => void
  inferSettings: (graph: SigmaKnowledgeGraph) => ForceAtlas2Settings
}

const graphPositionCache = new Map<string, { x: number; y: number }>()
const forceAtlas2Layout = forceAtlas2.default as unknown as ForceAtlas2Runner
let previousLayoutKey = ""

const graphNodeTypeColors: Record<string, string> = {
  concept: "#a78bfa",
  entity: "#34d399",
  page: "#60a5fa",
  source: "#2dd4bf",
  topic: "#fb923c",
  wiki: "#38bdf8",
}

const graphRelationColors: Record<GraphEdge["relation_type"], string> = {
  common_neighbor: "#5eead4",
  evidence_relationship: "#c084fc",
  generated_relationship: "#f472b6",
  manual: "#a78bfa",
  shared_source: "#93c5fd",
  type_affinity: "#fdba74",
  wikilink: "#cbd5e1",
}

const graphHoverLabelBackground = "rgba(15, 23, 42, 0.94)"
const graphHoverLabelBorder = "rgba(248, 250, 252, 0.28)"
const graphHoverLabelText = "#f8fafc"
const graphHoverLabelShadow = "rgba(0, 0, 0, 0.45)"
const graphHoverNodeRing = "rgba(248, 250, 252, 0.72)"

export function KnowledgeBaseGraphPage() {
  const { knowledgeBaseId } = useParams()
  const { t } = useTranslation()
  const apiClient = useApiClient()
  const [selection, setSelection] = useState<GraphSelection | null>(null)
  const [focusStack, setFocusStack] = useState<string[]>([])
  const [knowledgeCheckOpen, setKnowledgeCheckOpen] = useState(false)
  const focusNodeId = focusStack.at(-1) ?? null
  const handleSelect = useCallback((nextSelection: GraphSelection) => {
    setSelection(nextSelection)

    if (nextSelection.kind === "insight") {
      const firstPageId = readInsightPageIds(nextSelection.value)[0]
      setFocusStack(firstPageId === undefined ? [] : [firstPageId])
    }
  }, [])
  const handleClearSelection = useCallback(() => {
    setSelection(null)
  }, [])

  const graphQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.graph("")
        : adminQueryKeys.graph(knowledgeBaseId),
    queryFn: () =>
      knowledgeBaseId === undefined
        ? null
        : apiClient.getGraph(knowledgeBaseId),
  })
  const insightsQuery = useQuery({
    enabled: knowledgeBaseId !== undefined,
    queryKey:
      knowledgeBaseId === undefined
        ? adminQueryKeys.graphInsights("")
        : adminQueryKeys.graphInsights(knowledgeBaseId),
    queryFn: () =>
      knowledgeBaseId === undefined
        ? null
        : apiClient.getGraphInsights(knowledgeBaseId),
    refetchInterval: (query) =>
      isActiveGraphInsightStatus(query.state.data?.status) ? 3000 : false,
    refetchIntervalInBackground: true,
  })

  const graph = graphQuery.data
  const insights = collectInsights(insightsQuery.data)
  const emptyReasons = insightsQuery.data?.empty_reasons ?? {}
  const insightStatus =
    insightsQuery.data?.status ?? createDefaultGraphInsightStatus()
  const visibleGraph = useMemo(
    () => filterGraph(graph, focusNodeId),
    [focusNodeId, graph]
  )
  const selectionHighlight = useMemo(
    () => createGraphSelectionHighlight(selection, visibleGraph),
    [selection, visibleGraph]
  )

  useEffect(() => {
    if (graph === null || graph === undefined) {
      setSelection(null)
      setFocusStack([])
      return
    }

    if (
      focusNodeId !== null &&
      !graph.nodes.some((node) => node.page_id === focusNodeId)
    ) {
      setFocusStack([])
    }

    if (selection !== null && !selectionExists(selection, graph, insights)) {
      setSelection(null)
    }
  }, [focusNodeId, graph, insights, selection])

  return (
    <div
      className="flex min-h-[calc(100dvh-5rem)] flex-col overflow-hidden"
      data-route-id="knowledge-base-graph"
    >
      <h1 className="sr-only">{t("graph.graphView")}</h1>

      {graphQuery.isLoading ? (
        <div className="p-6">
          <LoadingState label={t("state.loading")} />
        </div>
      ) : null}
      {graphQuery.isError ? (
        <div className="p-6">
          <ErrorAlert title={t("state.loadFailed")} />
        </div>
      ) : null}
      {graph !== null && graph !== undefined && graph.nodes.length === 0 ? (
        <div className="p-6">
          <EmptyState title={t("graph.noGraph")} />
        </div>
      ) : null}
      {graph !== null && graph !== undefined && graph.nodes.length > 0 ? (
        <GraphWorkbenchDetail
          actions={
            <>
              <Button
                aria-label={t("action.runKnowledgeCheck")}
                onClick={() => setKnowledgeCheckOpen(true)}
                size="icon"
                title={t("action.runKnowledgeCheck")}
                type="button"
                variant="outline"
              >
                <ListChecks aria-hidden="true" data-icon="inline-start" />
              </Button>
              <Button
                aria-label={t("graph.exportGraph")}
                disabled={graph === null || graph === undefined}
                onClick={() => {
                  if (graph !== null && graph !== undefined) {
                    exportGraph(graph)
                  }
                }}
                size="icon"
                title={t("graph.exportGraph")}
                type="button"
                variant="outline"
              >
                <Download aria-hidden="true" data-icon="inline-start" />
              </Button>
            </>
          }
          focusNodeId={focusNodeId}
          emptyReasons={emptyReasons}
          graph={graph}
          visibleGraph={visibleGraph}
          insightStatus={insightStatus}
          insights={insights}
          onClearSelection={handleClearSelection}
          onDrillDown={(nodeId) =>
            setFocusStack((current) =>
              current.at(-1) === nodeId ? current : [...current, nodeId]
            )
          }
          onDrillUp={() => setFocusStack((current) => current.slice(0, -1))}
          onResetFocus={() => setFocusStack([])}
          onSelect={handleSelect}
          selection={selection}
          selectionHighlight={selectionHighlight}
        />
      ) : null}

      <KnowledgeCheckDialog
        knowledgeBaseId={knowledgeBaseId}
        onOpenChange={setKnowledgeCheckOpen}
        open={knowledgeCheckOpen}
      />
    </div>
  )
}

function GraphWorkbenchDetail({
  actions,
  emptyReasons,
  focusNodeId,
  graph,
  insightStatus,
  insights,
  onClearSelection,
  onDrillDown,
  onDrillUp,
  onResetFocus,
  onSelect,
  selection,
  selectionHighlight,
  visibleGraph,
}: {
  actions: ReactNode
  emptyReasons: Record<string, string>
  focusNodeId: string | null
  graph: GraphResponse
  insightStatus: GraphInsightStatus
  insights: GraphInsightItem[]
  onClearSelection: () => void
  onDrillDown: (nodeId: string) => void
  onDrillUp: () => void
  onResetFocus: () => void
  onSelect: (selection: GraphSelection) => void
  selection: GraphSelection | null
  selectionHighlight: GraphSelectionHighlight
  visibleGraph: GraphResponse
}) {
  const { t } = useTranslation()

  return (
    <IdeWorkbenchDetailPanel
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {t(`status.${toStatusLabelKey(insightStatus.state)}`)}
          </Badge>
          {actions}
          {selection?.kind === "node" ? (
            <Button
              disabled={focusNodeId === selection.value.page_id}
              onClick={() => onDrillDown(selection.value.page_id)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("ide.drillDown")}
            </Button>
          ) : null}
          <Button
            disabled={focusNodeId === null}
            onClick={onDrillUp}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("ide.upOneLevel")}
          </Button>
          <Button
            disabled={focusNodeId === null}
            onClick={onResetFocus}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("graph.resetFocus")}
          </Button>
        </div>
      }
      bottomPanelAriaLabel={t("ide.detailsPanel")}
      bottomPanelClassName={
        selection === null ? undefined : "xl:right-[calc(24rem+0.75rem)]"
      }
      bottomPanelCloseLabel={t("ide.closeDetails")}
      bottomPanelDefaultOpen={selection !== null}
      bottomPanelFloatingCloseLabel={t("action.close")}
      bottomPanelOpenLabel={t("ide.openDetails")}
      bottomPanelResizeLabel={t("ide.resizeDetails")}
      bottomPanelStateKey={
        selection === null ? undefined : createGraphSelectionKey(selection)
      }
      bottomTabs={
        selection === null
          ? []
          : [
              {
                content: (
                  <GraphInsightsList
                    emptyReasons={emptyReasons}
                    insights={insights}
                    onSelect={onSelect}
                  />
                ),
                id: "insights",
                label: t("graph.insights"),
              },
              {
                content: <InspectorJson value={selection.value} />,
                id: "data",
                label: t("ide.rawData"),
              },
            ]
      }
      contentClassName="overflow-hidden p-0"
      primary={
        <GraphWorkbenchPrimary
          focusNodeId={focusNodeId}
          graph={graph}
          insights={insights}
          onClearSelection={onClearSelection}
          onSelect={onSelect}
          selectedEdgeIds={selectionHighlight.selectedEdgeIds}
          selectedNodeIds={selectionHighlight.selectedNodeIds}
          selection={selection}
          visibleGraph={visibleGraph}
        />
      }
      subtitle={
        focusNodeId === null ? (
          t("graph.selectNodeOrEdge")
        ) : (
          <ResourceIdDisplay resourceId={focusNodeId} />
        )
      }
      title={t("graph.graphView")}
    />
  )
}

function GraphWorkbenchPrimary({
  focusNodeId,
  graph,
  insights,
  onClearSelection,
  onSelect,
  selectedEdgeIds,
  selectedNodeIds,
  selection,
  visibleGraph,
}: {
  focusNodeId: string | null
  graph: GraphResponse
  insights: GraphInsightItem[]
  onClearSelection: () => void
  onSelect: (selection: GraphSelection) => void
  selectedEdgeIds: readonly string[]
  selectedNodeIds: readonly string[]
  selection: GraphSelection | null
  visibleGraph: GraphResponse
}) {
  const { t } = useTranslation()
  const selectedTitle =
    selection?.kind === "node"
      ? selection.value.title
      : selection?.kind === "edge"
        ? selection.value.edge_id
        : selection?.kind === "insight"
          ? (selection.value.title ?? formatInsightLabel(selection.value))
          : null

  return (
    <div
      className={cn(
        "grid h-full min-h-0",
        selection === null
          ? "grid-cols-1"
          : "grid-rows-[minmax(24rem,1fr)_minmax(18rem,40%)] xl:grid-cols-[minmax(0,1fr)_24rem] xl:grid-rows-1"
      )}
    >
      <GraphCanvas
        focusNodeId={focusNodeId}
        graph={visibleGraph}
        onClearSelection={onClearSelection}
        onSelect={onSelect}
        selectedEdgeIds={selectedEdgeIds}
        selectedNodeIds={selectedNodeIds}
      />
      {selection === null ? null : (
        <aside className="min-h-0 overflow-auto border-t bg-background p-4 xl:border-t-0 xl:border-l">
          <div className="flex flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {selection.kind === "node"
                    ? t("graph.nodes")
                    : selection.kind === "edge"
                      ? t("graph.edge")
                      : t("graph.insights")}
                </Badge>
              </div>
              <h2 className="truncate text-sm font-semibold">
                {selectedTitle}
              </h2>
            </div>
            <GraphSelectionSummary
              graph={graph}
              insights={insights}
              onSelect={onSelect}
              selection={selection}
            />
          </div>
        </aside>
      )}
    </div>
  )
}

function GraphCanvas({
  focusNodeId,
  graph,
  onClearSelection,
  onSelect,
  selectedEdgeIds,
  selectedNodeIds,
}: {
  focusNodeId: string | null
  graph: GraphResponse
  onClearSelection: () => void
  onSelect: (selection: GraphSelection) => void
  selectedEdgeIds: readonly string[]
  selectedNodeIds: readonly string[]
}) {
  const { t } = useTranslation()
  const sigmaGraph = useMemo(() => createSigmaGraph(graph), [graph])

  return (
    <section
      aria-label={t("ide.graphCanvas")}
      className="relative h-full min-h-[36rem] min-w-0 overflow-hidden bg-slate-950"
      data-testid="graph-canvas"
    >
      <SigmaContainer
        className="h-full min-h-[36rem] w-full bg-slate-950 [--sigma-background-color:#020617]"
        settings={{
          allowInvalidContainer: true,
          defaultEdgeColor: "#cbd5e1",
          defaultEdgeType: "arrow",
          defaultNodeColor: "#e2e8f0",
          edgeLabelColor: { color: "#e5e7eb" },
          edgeLabelSize: 12,
          hideEdgesOnMove: false,
          hideLabelsOnMove: true,
          labelColor: { color: "#f8fafc" },
          labelDensity: 0.18,
          labelRenderedSizeThreshold: 8,
          labelSize: 13,
          labelWeight: "600",
          renderEdgeLabels: true,
          stagePadding: 42,
          defaultDrawNodeHover: drawGraphNodeHover,
          edgeReducer: (_edge, attributes) => reduceSigmaEdge(attributes),
          nodeReducer: (_node, attributes) => reduceSigmaNode(attributes),
        }}
      >
        <SigmaGraphLoader graph={sigmaGraph} />
        <SigmaGraphEvents
          graph={graph}
          onClearSelection={onClearSelection}
          onSelect={onSelect}
        />
        <SigmaSelectionHighlighter
          selectedEdgeIds={selectedEdgeIds}
          selectedNodeIds={selectedNodeIds}
        />
        <SigmaTopControls focusNodeId={focusNodeId} graph={graph} />
      </SigmaContainer>
    </section>
  )
}

function SigmaTopControls({
  focusNodeId,
  graph,
}: {
  focusNodeId: string | null
  graph: GraphResponse
}) {
  const { t } = useTranslation()

  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 text-xs text-slate-100">
      <span className="rounded border border-white/15 bg-slate-900/85 px-2 py-1 shadow-sm backdrop-blur">
        {graph.nodes.length} {t("graph.nodes")}
      </span>
      <span className="rounded border border-white/15 bg-slate-900/85 px-2 py-1 shadow-sm backdrop-blur">
        {graph.edges.length} {t("graph.edges")}
      </span>
      {focusNodeId === null ? null : (
        <span className="rounded border border-white/15 bg-slate-900/85 px-2 py-1 shadow-sm backdrop-blur">
          {t("ide.drillDown")}
        </span>
      )}
      <SigmaZoomControls />
    </div>
  )
}

function SigmaGraphLoader({ graph }: { graph: SigmaKnowledgeGraph }) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()

  useEffect(() => {
    loadGraph(graph)
    const resetCamera = () => {
      sigma.refresh()
      sigma.getCamera().animatedReset({ duration: 180 })
    }
    const animationFrame = requestAnimationFrame(resetCamera)
    const timeout = window.setTimeout(resetCamera, 120)

    return () => {
      cancelAnimationFrame(animationFrame)
      window.clearTimeout(timeout)
    }
  }, [graph, loadGraph, sigma])

  return null
}

function SigmaGraphEvents({
  graph,
  onClearSelection,
  onSelect,
}: {
  graph: GraphResponse
  onClearSelection: () => void
  onSelect: (selection: GraphSelection) => void
}) {
  const registerEvents = useRegisterEvents()
  const sigma = useSigma()

  useEffect(() => {
    registerEvents({
      clickEdge: (payload: SigmaEdgeEventPayload) => {
        const graphEdge = graph.edges.find(
          (edge) => edge.edge_id === payload.edge
        )

        if (graphEdge !== undefined) {
          onSelect({ kind: "edge", value: graphEdge })
        }
      },
      clickNode: (payload: SigmaNodeEventPayload) => {
        const graphNode = graph.nodes.find(
          (node) => node.page_id === payload.node
        )

        if (graphNode !== undefined) {
          onSelect({ kind: "node", value: graphNode })
        }
      },
      clickStage: () => {
        onClearSelection()
      },
      enterEdge: (payload: SigmaEdgeEventPayload) => {
        const sigmaGraph = sigma.getGraph()
        const source = sigmaGraph.source(payload.edge)
        const target = sigmaGraph.target(payload.edge)

        sigma.getContainer().style.cursor = "pointer"
        setSigmaEdgeHoverState(sigmaGraph, payload.edge, source, target)
        sigma.refresh()
      },
      enterNode: (payload: SigmaNodeEventPayload) => {
        sigma.getContainer().style.cursor = "pointer"
        setSigmaNodeHoverState(sigma.getGraph(), payload.node)
        sigma.refresh()
      },
      leaveEdge: () => {
        sigma.getContainer().style.cursor = "default"
        clearSigmaHoverState(sigma.getGraph())
        sigma.refresh()
      },
      leaveNode: () => {
        sigma.getContainer().style.cursor = "default"
        clearSigmaHoverState(sigma.getGraph())
        sigma.refresh()
      },
    })
  }, [
    graph.edges,
    graph.nodes,
    onClearSelection,
    onSelect,
    registerEvents,
    sigma,
  ])

  return null
}

function SigmaSelectionHighlighter({
  selectedEdgeIds,
  selectedNodeIds,
}: {
  selectedEdgeIds: readonly string[]
  selectedNodeIds: readonly string[]
}) {
  const sigma = useSigma()

  useEffect(() => {
    const graph = sigma.getGraph()
    const selectedNodeSet = new Set(
      selectedNodeIds.filter((nodeId) => graph.hasNode(nodeId))
    )
    const selectedEdgeSet = new Set(
      selectedEdgeIds.filter((edgeId) => graph.hasEdge(edgeId))
    )
    const relatedNodeIds = new Set(selectedNodeSet)

    for (const nodeId of selectedNodeSet) {
      for (const neighborId of graph.neighbors(nodeId)) {
        relatedNodeIds.add(neighborId)
      }
    }
    for (const edgeId of selectedEdgeSet) {
      relatedNodeIds.add(graph.source(edgeId))
      relatedNodeIds.add(graph.target(edgeId))
    }

    const hasSelection = selectedNodeSet.size > 0 || selectedEdgeSet.size > 0

    graph.forEachNode((nodeId) => {
      const selected = selectedNodeSet.has(nodeId)
      const connected = !selected && relatedNodeIds.has(nodeId)
      const dimmed = hasSelection && !selected && !connected

      graph.setNodeAttribute(nodeId, "selected", selected)
      graph.setNodeAttribute(nodeId, "highlighted", connected)
      graph.setNodeAttribute(nodeId, "dimmed", dimmed)
    })
    graph.forEachEdge((edgeId, _attributes, source, target) => {
      const selected = selectedEdgeSet.has(edgeId)
      const connected =
        selectedNodeSet.has(source) ||
        selectedNodeSet.has(target) ||
        selectedEdgeSet.has(edgeId)
      const dimmed = hasSelection && !selected && !connected

      graph.setEdgeAttribute(edgeId, "selected", selected)
      graph.setEdgeAttribute(edgeId, "highlighted", selected || connected)
      graph.setEdgeAttribute(edgeId, "dimmed", dimmed)
    })
    sigma.refresh()
  }, [selectedEdgeIds, selectedNodeIds, sigma])

  return null
}

function SigmaZoomControls() {
  const { t } = useTranslation()
  const sigma = useSigma()

  return (
    <div className="pointer-events-auto flex gap-1">
      <Button
        aria-label={t("graph.zoomIn")}
        className="size-8 border-white/15 bg-slate-900/85 text-slate-100 shadow-sm backdrop-blur hover:bg-slate-800 hover:text-white"
        onClick={() => sigma.getCamera().animatedZoom({ duration: 180 })}
        size="icon"
        title={t("graph.zoomIn")}
        type="button"
        variant="outline"
      >
        <ZoomIn aria-hidden="true" data-icon="inline-start" />
      </Button>
      <Button
        aria-label={t("graph.zoomOut")}
        className="size-8 border-white/15 bg-slate-900/85 text-slate-100 shadow-sm backdrop-blur hover:bg-slate-800 hover:text-white"
        onClick={() => sigma.getCamera().animatedUnzoom({ duration: 180 })}
        size="icon"
        title={t("graph.zoomOut")}
        type="button"
        variant="outline"
      >
        <ZoomOut aria-hidden="true" data-icon="inline-start" />
      </Button>
      <Button
        aria-label={t("graph.resetView")}
        className="size-8 border-white/15 bg-slate-900/85 text-slate-100 shadow-sm backdrop-blur hover:bg-slate-800 hover:text-white"
        onClick={() => sigma.getCamera().animatedReset({ duration: 220 })}
        size="icon"
        title={t("graph.resetView")}
        type="button"
        variant="outline"
      >
        <Maximize2 aria-hidden="true" data-icon="inline-start" />
      </Button>
    </div>
  )
}

function GraphSelectionSummary({
  graph,
  insights,
  onSelect,
  selection,
}: {
  graph: GraphResponse
  insights: GraphInsightItem[]
  onSelect: (selection: GraphSelection) => void
  selection: GraphSelection | null
}) {
  const { t } = useTranslation()

  if (selection === null) {
    return (
      <InspectorGrid>
        <InspectorField label={t("graph.nodes")}>
          {graph.nodes.length}
        </InspectorField>
        <InspectorField label={t("graph.edges")}>
          {graph.edges.length}
        </InspectorField>
      </InspectorGrid>
    )
  }

  if (selection.kind === "edge") {
    const edge = selection.value

    return (
      <div className="flex flex-col gap-4">
        <InspectorGrid>
          <InspectorField label={t("graph.edge")}>
            <ResourceIdDisplay resourceId={edge.edge_id} />
          </InspectorField>
          <InspectorField label={t("graph.relation")}>
            {edge.relation_type}
          </InspectorField>
          <InspectorField label={t("graph.weight")}>
            {edge.weight}
          </InspectorField>
          {edge.algorithm === undefined ? null : (
            <InspectorField label={t("graph.algorithm")}>
              {edge.algorithm.name}
            </InspectorField>
          )}
          <InspectorField label={t("graph.nodes")}>
            <div className="flex flex-col gap-1">
              <ResourceIdDisplay resourceId={edge.from_page_id} />
              <ResourceIdDisplay resourceId={edge.to_page_id} />
            </div>
          </InspectorField>
        </InspectorGrid>
        <InspectorSection title={t("graph.whyRelated")}>
          <div className="text-sm">{edge.explanation}</div>
        </InspectorSection>
        <InspectorSection title={t("graph.signalContributions")}>
          {edge.signal_contributions?.length ? (
            <div className="flex flex-col gap-2">
              {edge.signal_contributions.map((signal) => (
                <div
                  className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm"
                  key={`${edge.edge_id}:${signal.type}`}
                >
                  <div className="font-medium">{signal.type}</div>
                  <div className="text-muted-foreground">
                    {signal.score} / {signal.weight}
                  </div>
                  {signal.reason_codes.length === 0 ? null : (
                    <div className="flex flex-wrap gap-1">
                      {signal.reason_codes.map((code) => (
                        <Badge key={code} variant="secondary">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t("source.notAvailable")}
            </div>
          )}
        </InspectorSection>
        <InspectorSection title={t("page.sources")}>
          {edge.source_document_ids.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("graph.noSourceRefs")}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {edge.source_document_ids.map((documentId) => (
                <ResourceIdDisplay key={documentId} resourceId={documentId} />
              ))}
            </div>
          )}
        </InspectorSection>
      </div>
    )
  }

  if (selection.kind === "insight") {
    return (
      <div className="flex flex-col gap-4">
        <InspectorGrid>
          <InspectorField label={t("page.column.title")}>
            {formatInsightLabel(selection.value)}
          </InspectorField>
          <InspectorField label={t("graph.insights")}>
            {selection.value.insight_type}
          </InspectorField>
          {selection.value.score === undefined ? null : (
            <InspectorField label={t("graph.weight")}>
              {selection.value.score}
            </InspectorField>
          )}
          {selection.value.severity === undefined ? null : (
            <InspectorField label={t("source.column.status")}>
              {t(`knowledgeCheck.severity.${selection.value.severity}`)}
            </InspectorField>
          )}
          {selection.value.page_id === undefined ? null : (
            <InspectorField label={t("graph.nodes")}>
              <ResourceIdDisplay resourceId={selection.value.page_id} />
            </InspectorField>
          )}
          {selection.value.page_ids === undefined ? null : (
            <InspectorField label={t("graph.nodes")}>
              <div className="flex flex-col gap-1">
                {selection.value.page_ids.map((pageId) => (
                  <ResourceIdDisplay key={pageId} resourceId={pageId} />
                ))}
              </div>
            </InspectorField>
          )}
          {selection.value.reason === undefined ? null : (
            <InspectorField label={t("graph.whyRelated")}>
              {selection.value.reason}
            </InspectorField>
          )}
        </InspectorGrid>
        <InspectorSection title={t("graph.reasonCodes")}>
          {selection.value.reason_codes?.length ? (
            <div className="flex flex-wrap gap-1">
              {selection.value.reason_codes.map((code) => (
                <Badge key={code} variant="secondary">
                  {code}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t("source.notAvailable")}
            </div>
          )}
        </InspectorSection>
        <InspectorSection title={t("graph.signalContributions")}>
          {selection.value.signal_contributions?.length ? (
            <InspectorJson value={selection.value.signal_contributions} />
          ) : (
            <div className="text-sm text-muted-foreground">
              {t("source.notAvailable")}
            </div>
          )}
        </InspectorSection>
      </div>
    )
  }

  const node = selection.value
  const connectedEdges = graph.edges.filter(
    (edge) =>
      edge.from_page_id === node.page_id || edge.to_page_id === node.page_id
  )
  const insightMembership = insights.filter(
    (insight) =>
      insight.page_id === node.page_id ||
      insight.page_ids?.includes(node.page_id) === true
  )

  return (
    <div className="flex flex-col gap-4">
      <InspectorGrid>
        <InspectorField label={t("page.column.title")}>
          {node.title}
        </InspectorField>
        <InspectorField label={t("page.column.type")}>
          {node.type}
        </InspectorField>
        <InspectorField label={t("page.column.version")}>
          <ResourceIdDisplay resourceId={node.page_version_id} />
        </InspectorField>
        <InspectorField label={t("graph.nodes")}>
          <ResourceIdDisplay resourceId={node.page_id} />
        </InspectorField>
      </InspectorGrid>
      <InspectorSection title={t("page.sources")}>
        {node.source_refs.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("graph.noSourceRefs")}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {node.source_refs.map((source) => (
              <ResourceIdDisplay
                key={`${source.document_id}:${source.locator ?? ""}`}
                resourceId={source.document_id}
              />
            ))}
          </div>
        )}
      </InspectorSection>
      <InspectorSection title={t("graph.insightMembership")}>
        {insightMembership.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("graph.noInsights")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {insightMembership.map((insight) => (
              <Button
                className="h-auto w-full justify-start px-2 py-1"
                key={createInsightKey(insight)}
                onClick={() => onSelect({ kind: "insight", value: insight })}
                type="button"
                variant="outline"
              >
                <span className="text-left">{formatInsightLabel(insight)}</span>
              </Button>
            ))}
          </div>
        )}
      </InspectorSection>
      <InspectorSection title={t("ide.connectedEdges")}>
        {connectedEdges.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("graph.noInsights")}
          </div>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {connectedEdges.map((edge) => (
              <li key={edge.edge_id}>
                <Button
                  aria-label={t("graph.viewEdgeAria", { edgeId: edge.edge_id })}
                  className="h-auto w-full justify-start px-2 py-1"
                  onClick={() => onSelect({ kind: "edge", value: edge })}
                  type="button"
                  variant="outline"
                >
                  <span className="grid gap-1 text-left">
                    <code
                      className="w-fit rounded border bg-background px-1.5 py-0.5 font-mono text-xs"
                      title={edge.edge_id}
                    >
                      {edge.edge_id}
                    </code>
                    <span className="text-muted-foreground">
                      {edge.explanation}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </InspectorSection>
    </div>
  )
}

function GraphInsightsList({
  emptyReasons,
  insights,
  onSelect,
}: {
  emptyReasons: Record<string, string>
  insights: GraphInsightItem[]
  onSelect: (selection: GraphSelection) => void
}) {
  const { t } = useTranslation()

  if (insights.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState title={t("graph.noInsights")} />
        {Object.keys(emptyReasons).length === 0 ? null : (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            {Object.entries(emptyReasons).map(([key, reason]) => (
              <div key={key}>
                <span className="font-medium text-foreground">{key}</span>:{" "}
                {reason}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {insights.map((insight) => (
        <div
          className="flex flex-col gap-2 rounded-md border p-3"
          key={createInsightKey(insight)}
        >
          <Button
            className="h-auto w-full justify-start px-0 py-0 text-left"
            onClick={() => onSelect({ kind: "insight", value: insight })}
            type="button"
            variant="ghost"
          >
            <span className="grid gap-1 text-left">
              <span className="font-medium">{formatInsightLabel(insight)}</span>
              <span className="text-muted-foreground">
                {insight.insight_type}
              </span>
              {insight.page_id === undefined ? null : (
                <code
                  className="w-fit rounded border bg-background px-1.5 py-0.5 font-mono text-xs"
                  title={insight.page_id}
                >
                  {insight.page_id}
                </code>
              )}
            </span>
          </Button>
        </div>
      ))}
    </div>
  )
}

function filterGraph(
  graph: GraphResponse | null | undefined,
  focusNodeId: string | null
) {
  if (graph === null || graph === undefined || focusNodeId === null) {
    return (
      graph ?? { edges: [], knowledge_base_id: "", nodes: [], version_id: null }
    )
  }

  const edges = graph.edges.filter(
    (edge) =>
      edge.from_page_id === focusNodeId || edge.to_page_id === focusNodeId
  )
  const nodeIds = new Set([focusNodeId])

  for (const edge of edges) {
    nodeIds.add(edge.from_page_id)
    nodeIds.add(edge.to_page_id)
  }

  return {
    ...graph,
    edges,
    nodes: graph.nodes.filter((node) => nodeIds.has(node.page_id)),
  }
}

export function createGraphSelectionHighlight(
  selection: GraphSelection | null,
  graph: GraphResponse
): GraphSelectionHighlight {
  const selectedEdgeIds = new Set<string>()
  const selectedNodeIds = new Set<string>()
  const visibleNodeIds = new Set(graph.nodes.map((node) => node.page_id))

  if (selection === null) {
    return { selectedEdgeIds: [], selectedNodeIds: [] }
  }

  if (selection.kind === "node") {
    if (visibleNodeIds.has(selection.value.page_id)) {
      selectedNodeIds.add(selection.value.page_id)
    }

    return {
      selectedEdgeIds: [...selectedEdgeIds],
      selectedNodeIds: [...selectedNodeIds],
    }
  }

  if (selection.kind === "edge") {
    addVisibleEdgeSelection(selection.value, selectedEdgeIds, selectedNodeIds)

    return {
      selectedEdgeIds: [...selectedEdgeIds],
      selectedNodeIds: [...selectedNodeIds],
    }
  }

  for (const pageId of readInsightPageIds(selection.value)) {
    if (visibleNodeIds.has(pageId)) {
      selectedNodeIds.add(pageId)
    }
  }

  const reasonEdgeIds = new Set(
    selection.value.reasons?.map((reason) => reason.edge_id) ?? []
  )

  for (const edge of graph.edges) {
    if (reasonEdgeIds.has(edge.edge_id)) {
      addVisibleEdgeSelection(edge, selectedEdgeIds, selectedNodeIds)
      continue
    }

    if (
      selectedNodeIds.has(edge.from_page_id) &&
      selectedNodeIds.has(edge.to_page_id)
    ) {
      selectedEdgeIds.add(edge.edge_id)
    }
  }

  return {
    selectedEdgeIds: [...selectedEdgeIds],
    selectedNodeIds: [...selectedNodeIds],
  }
}

function addVisibleEdgeSelection(
  edge: GraphEdge,
  selectedEdgeIds: Set<string>,
  selectedNodeIds: Set<string>
) {
  selectedEdgeIds.add(edge.edge_id)
  selectedNodeIds.add(edge.from_page_id)
  selectedNodeIds.add(edge.to_page_id)
}

function readInsightPageIds(insight: GraphInsightItem) {
  return [
    ...(insight.page_id === undefined ? [] : [insight.page_id]),
    ...(insight.page_ids ?? []),
  ]
}

export function createSigmaGraph(graph: GraphResponse): SigmaKnowledgeGraph {
  const sigmaGraph: SigmaKnowledgeGraph = new MultiDirectedGraph({
    allowSelfLoops: true,
    multi: true,
    type: "directed",
  })
  const nodeDegree = getGraphNodeDegrees(graph)
  const maxDegree = Math.max(...nodeDegree.values(), 1)
  const layoutKey = createGraphLayoutKey(graph)
  const shouldRunLayout = previousLayoutKey !== layoutKey

  graph.nodes.forEach((node, index) => {
    const position =
      graphPositionCache.get(node.page_id) ??
      getInitialGraphPosition(index, graph.nodes.length)
    const degree = nodeDegree.get(node.page_id) ?? 0

    sigmaGraph.addNode(node.page_id, {
      color: graphNodeTypeColors[node.type] ?? "#64748b",
      graphNode: node,
      label: node.title,
      nodeType: node.type,
      size: getSigmaNodeSize(degree, maxDegree),
      x: position.x,
      y: position.y,
    })
  })

  const maxWeight = Math.max(...graph.edges.map((edge) => edge.weight), 1)

  const visualEdgePairs = new Set<string>()

  graph.edges.forEach((edge) => {
    if (
      !sigmaGraph.hasNode(edge.from_page_id) ||
      !sigmaGraph.hasNode(edge.to_page_id)
    ) {
      return
    }

    const visualEdgePairKey = `${edge.from_page_id}\u0000${edge.to_page_id}`

    if (visualEdgePairs.has(visualEdgePairKey)) {
      return
    }

    visualEdgePairs.add(visualEdgePairKey)

    const normalizedWeight = Math.max(0.15, edge.weight / maxWeight)

    sigmaGraph.addDirectedEdgeWithKey(
      edge.edge_id,
      edge.from_page_id,
      edge.to_page_id,
      {
        color: graphRelationColors[edge.relation_type],
        graphEdge: edge,
        label: edge.relation_type,
        relationType: edge.relation_type,
        size: 0.8 + normalizedWeight * 2.8,
        weight: edge.weight,
      }
    )
  })

  if (shouldRunLayout && graph.nodes.length > 1) {
    const settings = forceAtlas2Layout.inferSettings(sigmaGraph)

    forceAtlas2Layout.assign(sigmaGraph, {
      iterations: Math.min(260, Math.max(120, graph.nodes.length * 14)),
      settings: {
        ...settings,
        barnesHutOptimize: graph.nodes.length > 60,
        gravity: 1,
        scalingRatio: 2.4,
        strongGravityMode: true,
      },
    })
    previousLayoutKey = layoutKey
    sigmaGraph.forEachNode((nodeId, attributes) => {
      graphPositionCache.set(nodeId, { x: attributes.x, y: attributes.y })
    })
  }

  return sigmaGraph
}

function getGraphNodeDegrees(graph: GraphResponse) {
  const nodeDegree = new Map<string, number>()

  for (const node of graph.nodes) {
    nodeDegree.set(node.page_id, 0)
  }

  for (const edge of graph.edges) {
    nodeDegree.set(
      edge.from_page_id,
      (nodeDegree.get(edge.from_page_id) ?? 0) + 1
    )
    nodeDegree.set(edge.to_page_id, (nodeDegree.get(edge.to_page_id) ?? 0) + 1)
  }

  return nodeDegree
}

function getInitialGraphPosition(index: number, total: number) {
  if (total <= 1) {
    return { x: 0, y: 0 }
  }

  const radius = Math.max(24, Math.sqrt(total) * 18)
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

function getSigmaNodeSize(degree: number, maxDegree: number) {
  const normalizedDegree = maxDegree === 0 ? 0 : degree / maxDegree

  return 7 + Math.sqrt(normalizedDegree) * 12
}

function createGraphLayoutKey(graph: GraphResponse) {
  const nodeKey = graph.nodes
    .map((node) => node.page_id)
    .sort()
    .join(",")
  const edgeKey = graph.edges
    .map(
      (edge) =>
        `${edge.edge_id}:${edge.from_page_id}:${edge.to_page_id}:${edge.weight}`
    )
    .sort()
    .join(",")

  return `${nodeKey}|${edgeKey}`
}

function reduceSigmaNode(attributes: Record<string, unknown>) {
  const reduced = { ...attributes }
  const baseSize = typeof attributes.size === "number" ? attributes.size : 7

  if (attributes.dimmed === true || attributes.hoverDimmed === true) {
    reduced.color = "#475569"
    reduced.label = ""
    reduced.size = Math.max(3, baseSize * 0.65)
  }

  if (attributes.highlighted === true || attributes.hoverNeighbor === true) {
    reduced.forceLabel = true
    reduced.size = baseSize * 1.18
  }

  if (attributes.selected === true || attributes.hovered === true) {
    reduced.forceLabel = true
    reduced.size = baseSize * 1.42
    reduced.zIndex = 10
  }

  return reduced
}

function reduceSigmaEdge(attributes: Record<string, unknown>) {
  const reduced = { ...attributes }
  const baseSize = typeof attributes.size === "number" ? attributes.size : 1

  if (attributes.dimmed === true || attributes.hoverDimmed === true) {
    reduced.color = "#334155"
    reduced.label = ""
    reduced.size = 0.25
  }

  if (attributes.highlighted === true || attributes.hovered === true) {
    reduced.forceLabel = true
    reduced.size = baseSize * 1.45
  }

  if (attributes.selected === true) {
    reduced.color = "#f8fafc"
    reduced.forceLabel = true
    reduced.size = Math.max(3, baseSize * 1.8)
    reduced.zIndex = 10
  }

  return reduced
}

const drawGraphNodeHover: NodeHoverDrawingFunction = (
  context,
  data,
  settings
) => {
  const label = typeof data.label === "string" ? data.label : ""
  const labelSize = settings.labelSize
  const nodeRadius = Math.max(data.size, labelSize / 2)

  context.save()
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 10
  context.shadowColor = graphHoverLabelShadow
  context.strokeStyle = graphHoverNodeRing
  context.lineWidth = 2
  context.beginPath()
  context.arc(data.x, data.y, data.size + 4, 0, Math.PI * 2)
  context.stroke()

  if (label.length > 0) {
    const paddingX = 8
    const paddingY = 4
    const gap = 8
    const radius = 7
    const labelHeight = labelSize + paddingY * 2

    context.font = `${settings.labelWeight} ${labelSize}px ${settings.labelFont}`

    const labelWidth = Math.ceil(
      context.measureText(label).width + paddingX * 2
    )
    const shouldRenderLeft =
      data.x + nodeRadius + gap + labelWidth > context.canvas.width - 8
    const labelX = shouldRenderLeft
      ? data.x - nodeRadius - gap - labelWidth
      : data.x + nodeRadius + gap
    const labelY = data.y - labelHeight / 2

    drawRoundedRect(context, labelX, labelY, labelWidth, labelHeight, radius)
    context.fillStyle = graphHoverLabelBackground
    context.fill()
    context.strokeStyle = graphHoverLabelBorder
    context.lineWidth = 1
    context.stroke()
    context.shadowBlur = 0
    context.fillStyle = graphHoverLabelText
    context.textBaseline = "middle"
    context.fillText(label, labelX + paddingX, data.y)
  }

  context.restore()
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height
  )
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function setSigmaNodeHoverState(
  graph: SigmaKnowledgeGraph,
  hoveredNodeId: string
) {
  const relatedNodes = new Set(graph.neighbors(hoveredNodeId))

  relatedNodes.add(hoveredNodeId)
  graph.forEachNode((nodeId) => {
    graph.setNodeAttribute(nodeId, "hovered", nodeId === hoveredNodeId)
    graph.setNodeAttribute(
      nodeId,
      "hoverNeighbor",
      nodeId !== hoveredNodeId && relatedNodes.has(nodeId)
    )
    graph.setNodeAttribute(nodeId, "hoverDimmed", !relatedNodes.has(nodeId))
  })
  graph.forEachEdge((edgeId, _attributes, source, target) => {
    const connected = source === hoveredNodeId || target === hoveredNodeId

    graph.setEdgeAttribute(edgeId, "hovered", false)
    graph.setEdgeAttribute(edgeId, "highlighted", connected)
    graph.setEdgeAttribute(edgeId, "hoverDimmed", !connected)
  })
}

function setSigmaEdgeHoverState(
  graph: SigmaKnowledgeGraph,
  hoveredEdgeId: string,
  sourceNodeId: string,
  targetNodeId: string
) {
  graph.forEachNode((nodeId) => {
    const connected = nodeId === sourceNodeId || nodeId === targetNodeId

    graph.setNodeAttribute(nodeId, "hovered", false)
    graph.setNodeAttribute(nodeId, "hoverNeighbor", connected)
    graph.setNodeAttribute(nodeId, "hoverDimmed", !connected)
  })
  graph.forEachEdge((edgeId) => {
    graph.setEdgeAttribute(edgeId, "hovered", edgeId === hoveredEdgeId)
    graph.setEdgeAttribute(edgeId, "hoverDimmed", edgeId !== hoveredEdgeId)
  })
}

function clearSigmaHoverState(graph: SigmaKnowledgeGraph) {
  graph.forEachNode((nodeId) => {
    graph.setNodeAttribute(nodeId, "hovered", false)
    graph.setNodeAttribute(nodeId, "hoverNeighbor", false)
    graph.setNodeAttribute(nodeId, "hoverDimmed", false)
  })
  graph.forEachEdge((edgeId) => {
    graph.setEdgeAttribute(edgeId, "hovered", false)
    graph.setEdgeAttribute(edgeId, "hoverDimmed", false)
  })
}

function selectionExists(
  selection: GraphSelection,
  graph: GraphResponse,
  insights: GraphInsightItem[]
) {
  if (selection.kind === "node") {
    return graph.nodes.some((node) => node.page_id === selection.value.page_id)
  }

  if (selection.kind === "edge") {
    return graph.edges.some((edge) => edge.edge_id === selection.value.edge_id)
  }

  return insights.some(
    (insight) =>
      createInsightKey(insight) === createInsightKey(selection.value) &&
      insight.insight_type === selection.value.insight_type
  )
}

function createGraphSelectionKey(selection: GraphSelection) {
  if (selection.kind === "node") {
    return `node:${selection.value.page_id}`
  }

  if (selection.kind === "edge") {
    return `edge:${selection.value.edge_id}`
  }

  return `insight:${createInsightKey(selection.value)}`
}

function exportGraph(graph: GraphResponse) {
  const blob = new Blob([JSON.stringify(graph, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `${graph.knowledge_base_id}-graph.json`
  link.click()
  URL.revokeObjectURL(url)
}

function collectInsights(data: GraphInsightsResponse | null | undefined) {
  if (data === null || data === undefined) {
    return []
  }

  return [
    ...data.knowledge_gaps,
    ...data.bridge_pages,
    ...data.isolated_pages,
    ...(data.sparse_pages ?? []),
    ...data.communities,
    ...data.surprising_connections,
  ]
}

function createDefaultGraphInsightStatus(): GraphInsightStatus {
  return {
    failure_reason: null,
    source_job_id: null,
    started_at: null,
    state: "ready",
    updated_at: null,
  }
}

function isActiveGraphInsightStatus(status: GraphInsightStatus | undefined) {
  return status?.state === "queued" || status?.state === "updating"
}

function toStatusLabelKey(status: GraphInsightStatus["state"]) {
  return status === "updating" ? "running" : status
}

function createInsightKey(insight: GraphInsightItem) {
  return [
    insight.insight_type,
    insight.page_id ?? "",
    ...(insight.page_ids ?? []),
  ].join(":")
}

function formatInsightLabel(insight: GraphInsightItem) {
  return insight.title ?? insight.page_ids?.join(", ") ?? insight.insight_type
}
