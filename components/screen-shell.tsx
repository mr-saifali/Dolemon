"use client";

import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrandBlob } from "./brand-blob";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ScreenShell({
  children,
  onBack,
  backHref,
  footer,
  className,
  center = false,
}: {
  children: ReactNode;
  onBack?: () => void;
  backHref?: string;
  footer?: ReactNode;
  className?: string;
  center?: boolean;
}) {
  const router = useRouter();
  const showBack = Boolean(onBack || backHref);

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink">
      <BrandBlob />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 safe-t">
        {showBack && (
          <div className="pt-5">
            <button
              type="button"
              onClick={() => (onBack ? onBack() : router.push(backHref!))}
              aria-label="Go back"
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
          className={cn("flex flex-1 flex-col", center && "justify-center", className)}
        >
          {children}
        </motion.div>
        {footer && <div className="pb-6 pt-4 safe-b">{footer}</div>}
      </div>
    </main>
  );
}

/** Small icon tile used as the single motif on each step. */
export function Motif({ icon, tone = "rose" }: { icon: ReactNode; tone?: "rose" | "success" }) {
  return (
    <div
      className={cn(
        "mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border text-rose",
        tone === "rose"
          ? "border-rose/20 bg-rose/10 shadow-glow"
          : "border-success/25 bg-success/10 text-success shadow-[0_0_50px_-14px_rgba(74,222,128,0.6)]"
      )}
    >
      {icon}
    </div>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-balance text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-text">
      {children}
    </h1>
  );
}

export function ScreenSubtitle({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[15px] leading-relaxed text-text-muted">{children}</p>;
}
