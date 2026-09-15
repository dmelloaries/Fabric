import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
        outline: 'text-foreground border-slate-200',
        direct:
          'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm font-bold',
        derived:
          'border-indigo-200 bg-indigo-50 text-indigo-800 shadow-sm font-bold',
        inferred:
          'border-purple-200 bg-purple-50 text-purple-800 shadow-sm font-bold',
        flagged:
          'border-amber-200 bg-amber-50 text-amber-800 shadow-sm font-bold',
        passthrough:
          'border-amber-200 bg-amber-50/80 text-amber-800 shadow-sm font-semibold',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm font-semibold',
        warning:
          'border-yellow-200 bg-yellow-50 text-yellow-800 shadow-sm font-semibold',
        info:
          'border-blue-200 bg-blue-50 text-blue-800 shadow-sm font-semibold',
      },
    },
    defaultVariants: {
      variant: 'default',
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
