import type { ReactNode } from "react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.js"

interface EmptyStateProps {
  action?: ReactNode
  description?: ReactNode
  title: ReactNode
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
  return (
    <Empty className="min-h-48">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description === undefined ? null : (
          <EmptyDescription>{description}</EmptyDescription>
        )}
      </EmptyHeader>
      {action === undefined ? null : <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
