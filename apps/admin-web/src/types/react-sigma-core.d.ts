declare module "@react-sigma/core" {
  import type {
    CSSProperties,
    ReactElement,
    ReactNode,
    RefAttributes,
  } from "react"
  import type { Attributes, AbstractGraph } from "graphology-types"
  import type Sigma from "sigma"
  import type { Settings } from "sigma/settings"
  import type {
    SigmaEdgeEventPayload,
    SigmaNodeEventPayload,
    SigmaStageEventPayload,
  } from "sigma/types"

  export interface SigmaContainerProps<
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  > {
    className?: string
    graph?: AbstractGraph<N, E, G>
    id?: string
    settings?: Partial<Settings<N, E, G>>
    style?: CSSProperties
  }

  export const SigmaContainer: <
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  >(
    props: SigmaContainerProps<N, E, G> & {
      children?: ReactNode
    } & RefAttributes<Sigma<N, E, G> | null>
  ) => ReactElement

  export interface SigmaEventHandlers {
    clickEdge?: (payload: SigmaEdgeEventPayload) => void
    clickNode?: (payload: SigmaNodeEventPayload) => void
    clickStage?: (payload: SigmaStageEventPayload) => void
    enterEdge?: (payload: SigmaEdgeEventPayload) => void
    enterNode?: (payload: SigmaNodeEventPayload) => void
    leaveEdge?: (payload: SigmaEdgeEventPayload) => void
    leaveNode?: (payload: SigmaNodeEventPayload) => void
  }

  export function useLoadGraph<
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  >(): (graph: AbstractGraph<N, E, G>, clear?: boolean) => void

  export function useRegisterEvents(): (
    eventHandlers: SigmaEventHandlers
  ) => void

  export function useSigma<
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  >(): Sigma<N, E, G>
}
