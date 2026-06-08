"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  label,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { label?: string }) {
  const boundedValue = Math.min(Math.max(value ?? 0, 0), 100)
  const progress = (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - boundedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  )

  if (label === undefined) {
    return progress
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span>{boundedValue}%</span>
      </div>
      {progress}
    </div>
  )
}

export { Progress }
