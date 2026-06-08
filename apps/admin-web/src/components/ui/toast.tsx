import type { ReactNode } from "react"
import { toast as sonnerToast } from "sonner"

import { Toaster } from "@/components/ui/sonner.js"

const defaultToastDurationMs = 5000

type ToastVariant = "default" | "error"

interface ToastInput {
  durationMs?: number
  message: ReactNode
  variant?: ToastVariant
}

export function showToast(input: ToastInput) {
  const options = {
    duration: input.durationMs ?? defaultToastDurationMs,
  }

  if ((input.variant ?? "default") === "error") {
    sonnerToast.error(<span role="alert">{input.message}</span>, options)
    return
  }

  sonnerToast(input.message, options)
}

export function ToastProvider() {
  return <Toaster position="bottom-right" richColors />
}
