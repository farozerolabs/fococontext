import type { ReactNode } from "react"

import { Button } from "@/components/ui/button.js"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js"

interface DangerousActionProps {
  cancelLabel: string
  children?: ReactNode
  confirmLabel: string
  description: ReactNode
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  title: ReactNode
}

export function DangerousAction({
  cancelLabel,
  children,
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: DangerousActionProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onConfirm} type="button" variant="destructive">
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
