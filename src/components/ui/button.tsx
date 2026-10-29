import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-touch px-4 text-sm",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary/90",
        secondary: "bg-surface-2 text-fg border border-border hover:bg-surface",
        ghost: "text-fg hover:bg-surface-2",
        danger: "bg-danger text-white hover:bg-danger/90",
        outline: "border border-border bg-transparent text-fg hover:bg-surface-2",
      },
      size: { md: "", sm: "min-h-8 px-3 text-xs", lg: "min-h-14 px-6 text-base", icon: "px-0 min-w-touch" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
