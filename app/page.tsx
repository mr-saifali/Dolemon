"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Download, Heart, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandBlob } from "@/components/brand-blob";
import { InstallSheet } from "@/components/pwa/install-sheet";
import { usePwa } from "@/components/pwa/pwa-provider";
import { Button } from "@/components/ui/button";
import { useSession, landingFor } from "@/lib/session";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function WelcomePage() {
  const router = useRouter();
  const { account, loading } = useSession();
  const { installed } = usePwa();
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (!loading && account) router.replace(landingFor(account));
  }, [account, loading, router]);

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink">
      <BrandBlob />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 safe-t">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="flex items-center gap-2 pt-8"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(150deg,#FF5C7A,#A78BFA)] shadow-[0_6px_18px_-6px_rgba(255,92,122,0.9)]">
            <Heart className="h-4 w-4 fill-white text-white" />
          </span>
          <span className="text-[15px] font-medium tracking-tight text-text">Dolemon</span>
          <Link
            href="/download"
            className="ml-1 rounded-full border border-white/10 px-2 py-[3px] text-[10.5px] font-medium tracking-wide text-text-muted transition-colors hover:border-rose/30 hover:text-rose"
          >
            v0.1
          </Link>
        </motion.header>

        <div className="flex flex-1 flex-col justify-center py-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}
            aria-hidden
            className="relative mb-9 h-32 w-32"
          >
            <div className="absolute inset-0 rounded-[36px] bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.26),rgba(255,160,122,0.10)_52%,transparent_74%)]" />
            <div className="relative flex h-32 w-32 items-center justify-center rounded-[32px] border border-white/[0.09] bg-[linear-gradient(160deg,rgba(255,92,122,0.16),rgba(167,139,250,0.10)_55%,rgba(255,255,255,0.02))] shadow-card">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(150deg,#FF5C7A,#A78BFA)] shadow-[0_14px_34px_-10px_rgba(255,92,122,0.9)]">
                <Heart className="h-7 w-7 fill-white text-white" strokeWidth={1.5} />
              </div>
            </div>
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 18 }}
              className="absolute -right-3 -top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-ink-surface text-sm shadow-lg"
            >
              ✨
            </motion.span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE, delay: 0.1 }}
            className="text-balance text-[32px] font-semibold leading-[1.12] tracking-[-0.025em] text-text"
          >
            A private space for{" "}
            <span className="text-vibrant">just you two.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE, delay: 0.16 }}
            className="mt-4 max-w-[19rem] text-[15px] leading-relaxed text-text-muted"
          >
            No groups. No noise. Just the person who matters.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE, delay: 0.22 }}
            className="mt-10 flex items-center gap-2 text-[12.5px] text-text-muted/80"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Invite-only. Your conversations stay between you.</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: EASE, delay: 0.28 }}
          className="space-y-3 pb-8 safe-b"
        >
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.push("/signup/email")}
            disabled={loading}
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>

          {!installed && (
            <button
              type="button"
              onClick={() => setSheet(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] py-3.5 text-[14.5px] font-medium text-text transition-colors hover:border-rose/25 hover:bg-white/[0.05] active:scale-[0.99]"
            >
              <Download className="h-4 w-4 text-rose" />
              Download the app
              <span className="rounded-full bg-rose/12 px-1.5 py-0.5 text-[10px] font-medium text-rose">
                v0.1
              </span>
            </button>
          )}

          <p className="pt-1 text-center text-[14px] text-text-muted">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="font-medium text-text underline-offset-4 transition-colors hover:text-rose hover:underline"
            >
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>

      <InstallSheet open={sheet} onClose={() => setSheet(false)} />
    </main>
  );
}
