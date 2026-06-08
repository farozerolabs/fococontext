import type { ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js"

interface ErrorAlertProps {
  description?: ReactNode
  title: ReactNode
}

export function ErrorAlert({ description, title }: ErrorAlertProps) {
  return (
    <Alert className="border-destructive/50 text-destructive">
      <AlertTitle>{title}</AlertTitle>
      {description === undefined ? null : (
        <AlertDescription>{description}</AlertDescription>
      )}
    </Alert>
  )
}
