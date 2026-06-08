import { Skeleton } from "@/components/ui/skeleton.js"

interface LoadingStateProps {
  label: string
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div aria-label={label} className="flex flex-col gap-3" role="status">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}
