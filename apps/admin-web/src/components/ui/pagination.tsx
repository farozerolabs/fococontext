import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

interface PaginationWindowInput {
  currentPage: number
  totalPages: number
  windowSize?: number
}

function createPaginationWindow({
  currentPage,
  totalPages,
  windowSize = 5,
}: PaginationWindowInput) {
  const boundedTotal = Math.max(0, totalPages)

  if (boundedTotal === 0) {
    return []
  }

  const boundedCurrent = Math.min(Math.max(currentPage, 1), boundedTotal)
  const boundedWindowSize = Math.max(1, windowSize)
  const halfWindow = Math.floor(boundedWindowSize / 2)
  const start = Math.max(
    1,
    Math.min(boundedCurrent - halfWindow, boundedTotal - boundedWindowSize + 1)
  )
  const end = Math.min(boundedTotal, start + boundedWindowSize - 1)

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  const { t } = useTranslation()

  return (
    <nav
      role="navigation"
      aria-label={t("pagination.label")}
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      asChild
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}
    >
      <a
        aria-current={isActive ? "page" : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props}
      />
    </Button>
  )
}

function PaginationPrevious({
  className,
  text,
  ...props
}: Omit<React.ComponentProps<typeof PaginationLink>, "size"> & {
  text?: string
}) {
  const { t } = useTranslation()
  const label = text ?? t("pagination.previous")

  return (
    <PaginationLink
      aria-label={t("pagination.previousPage")}
      size="default"
      className={cn("pl-1.5!", className)}
      {...props}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{label}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text,
  ...props
}: Omit<React.ComponentProps<typeof PaginationLink>, "size"> & {
  text?: string
}) {
  const { t } = useTranslation()
  const label = text ?? t("pagination.next")

  return (
    <PaginationLink
      aria-label={t("pagination.nextPage")}
      size="default"
      className={cn("pr-1.5!", className)}
      {...props}
    >
      <span className="hidden sm:block">{label}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { t } = useTranslation()

  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">{t("pagination.morePages")}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  createPaginationWindow,
}
