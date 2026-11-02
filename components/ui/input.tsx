"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  prefixText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, prefixText, ...props }, ref) => (
    <div className="relative">
      {prefixText && (
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-text-muted">
          {prefixText}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-14 w-full rounded-field border bg-ink-surface px-4 text-[16px] text-text placeholder:text-text-muted/70 transition-colors duration-200",
          "border-ink-line hover:border-[#3A3A45] focus:border-rose/70 focus:ring-4 focus:ring-rose/10",
          prefixText && "pl-9",
          invalid && "border-danger/60 focus:border-danger focus:ring-danger/10",
          className
        )}
        {...props}
      />
    </div>
  )
);
Input.displayName = "Input";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("mb-2 block text-[13px] font-medium tracking-wide text-text-muted", className)}
      {...props}
    />
  )
);
Label.displayName = "Label";

export { Input, Label };
