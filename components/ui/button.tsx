"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985] select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-rose text-[#1A0A0F] hover:bg-rose-soft shadow-[0_10px_30px_-12px_rgba(255,92,122,0.8)]",
        secondary: "bg-ink-raised text-text hover:bg-[#2A2A33]",
        outline: "border border-ink-line bg-transparent text-text hover:bg-white/[0.04]",
        ghost: "text-text-muted hover:text-text hover:bg-white/[0.04]",
        danger: "bg-danger/10 text-danger hover:bg-danger/15 border border-danger/25",
      },
      size: {
        default: "h-12 px-6 text-[15px] rounded-full",
        sm: "h-9 px-4 text-[13px] rounded-full",
        lg: "h-14 px-7 text-base rounded-full",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span>Just a sec…</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
