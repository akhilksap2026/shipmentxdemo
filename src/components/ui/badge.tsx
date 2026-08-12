import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase",
  {
    variants: {
      variant: {
        default: "bg-[#201e1d] text-white",
        brand: "bg-[#d9291c] text-white",
        secondary: "bg-neutral-800 text-neutral-100",
        outline: "border border-neutral-400 text-neutral-700",
        muted: "bg-neutral-200 text-neutral-700",
        amber: "bg-amber-400 text-amber-900",
        red: "bg-red-600 text-white",
        green: "bg-green-600 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
