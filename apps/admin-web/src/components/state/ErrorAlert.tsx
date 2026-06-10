import type { ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js"

interface ErrorAlertProps {
  action?: ReactNode
  description?: ReactNode
  title: ReactNode
}

export function ErrorAlert({ action, description, title }: ErrorAlertProps) {
  return (
    <Alert className="border-destructive/50 text-destructive">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <AlertTitle>{title}</AlertTitle>
          {description === undefined ? null : (
            <AlertDescription>{description}</AlertDescription>
          )}
        </div>
        {action === undefined ? null : <div>{action}</div>}
      </div>
    </Alert>
  )
}
