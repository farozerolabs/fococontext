import { CopyResourceIdButton } from "@/components/resource-id/CopyResourceIdButton.js"
import { formatResourceId } from "@/components/resource-id/resource-id.js"
import { cn } from "@/lib/utils.js"

interface ResourceIdDisplayProps {
  className?: string
  resourceId: string
  withCopy?: boolean
}

export function ResourceIdDisplay({
  className,
  resourceId,
  withCopy = true,
}: ResourceIdDisplayProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <code
        className="max-w-40 truncate rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
        title={resourceId}
      >
        {formatResourceId(resourceId)}
      </code>
      {withCopy ? <CopyResourceIdButton resourceId={resourceId} /> : null}
    </span>
  )
}
