import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button.js"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.js"

interface CopyResourceIdButtonProps {
  resourceId: string
}

export function CopyResourceIdButton({
  resourceId,
}: CopyResourceIdButtonProps) {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)

  async function copyResourceId() {
    await navigator.clipboard.writeText(resourceId)
    setIsCopied(true)
  }

  const Icon = isCopied ? Check : Copy
  const label = isCopied ? t("resourceId.copied") : t("action.copyId")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={t("action.copyId")}
          data-copy-status={isCopied ? "copied" : "idle"}
          onClick={() => void copyResourceId()}
          size="icon-sm"
          title={label}
          type="button"
          variant="outline"
        >
          <Icon aria-hidden="true" data-icon="inline-start" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
