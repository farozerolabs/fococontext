import { X } from "lucide-react"
import { type PropsWithChildren, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button.js"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.js"

interface AppSheetProps extends PropsWithChildren {
  closeLabel?: string
  description?: ReactNode
  onOpenChange?: (open: boolean) => void
  open: boolean
  title: ReactNode
}

export function AppSheet({
  children,
  closeLabel,
  description,
  onOpenChange,
  open,
  title,
}: AppSheetProps) {
  const { t } = useTranslation()
  const resolvedCloseLabel = closeLabel ?? t("action.dismissPanel")

  return (
    <Sheet
      open={open}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <SheetContent className="w-full max-w-xl p-5" showCloseButton={false}>
        <SheetHeader className="p-0 pr-8">
          <SheetTitle className="text-lg tracking-normal">{title}</SheetTitle>
          {description === undefined ? null : (
            <SheetDescription>{description}</SheetDescription>
          )}
        </SheetHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 pr-1"
          data-testid="sheet-scroll-area"
        >
          {children}
        </div>
        <SheetClose asChild>
          <Button
            aria-label={resolvedCloseLabel}
            className="absolute top-3 right-3"
            size="icon-sm"
            title={resolvedCloseLabel}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" data-icon="inline-start" />
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  )
}
