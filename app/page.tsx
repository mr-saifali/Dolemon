"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Heart, Lock } from "lucide-react";
import { useEffect } from "react";
import { BrandBlob } from "@/components/brand-blob";
import { Button } from "@/components/ui/button";
import { useSession, landingFor } from "@/lib/session";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function WelcomePage() {
  const router = useRouter();
  const { account, loading } = useSession();

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
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose/15 ring-1 ring-rose/25">
            <Heart className="h-4 w-4 fill-rose text-rose" />
          </span>
          <span className="text-[15px] font-medium tracking-tight text-text">Dolemon</span>
        </motion.header>

        <div className="flex flex-1 flex-col justify-center py-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}
            aria-hidden
            className="relative mb-9 h-32 w-32"
          >
            <div className="absolute inset-0 rounded-[36px] bg-rose/10 blur-xl" />
            <div className="relative flex h-32 w-32 items-center justify-center rounded-[32px] border border-white/[0.07] bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-card backdrop-blur-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose/15 ring-1 ring-rose/30">
                <Heart className="h-7 w-7 fill-rose text-rose" strokeWidth={1.5} />
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
            A private space for just you two.
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
    </main>
  );
}
