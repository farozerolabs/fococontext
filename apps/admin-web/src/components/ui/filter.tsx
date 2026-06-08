import { useId, type ComponentProps } from "react"

import { Field, FieldLabel } from "@/components/ui/field.js"
import { Input } from "@/components/ui/input.js"

interface FilterInputProps extends ComponentProps<"input"> {
  label: string
}

export function FilterInput({ className, label, ...props }: FilterInputProps) {
  const fallbackId = useId()
  const id = props.id ?? fallbackId

  return (
    <Field className="w-full max-w-sm gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        aria-label={props["aria-label"] ?? label}
        className={className}
        id={id}
        type="search"
        {...props}
      />
    </Field>
  )
}
