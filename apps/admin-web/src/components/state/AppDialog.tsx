import { X } from "lucide-react"
import { type PropsWithChildren, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button.js"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js"

interface AppDialogProps extends PropsWithChildren {
  description?: ReactNode
  footer?: ReactNode
  onOpenChange?: (open: boolean) => void
  open: boolean
  title: ReactNode
}

export function AppDialog({
  children,
  description,
  footer,
  onOpenChange,
  open,
  title,
}: AppDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <DialogContent
        className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg"
        showCloseButton={false}
        {...(description === undefined
          ? { "aria-describedby": undefined }
          : {})}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          {description === undefined ? null : (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          {children}
        </div>
        {footer === undefined ? null : <DialogFooter>{footer}</DialogFooter>}
        <DialogClose asChild>
          <Button
            aria-label={t("action.dismissDialog")}
            className="absolute top-2 right-2"
            size="icon-sm"
            title={t("action.dismissDialog")}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" data-icon="inline-start" />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
