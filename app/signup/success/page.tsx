"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Share2 } from "lucide-react";
import { toast } from "sonner";
import { BrandBlob } from "@/components/brand-blob";
import { Button } from "@/components/ui/button";
import { avatarById } from "@/lib/avatars";
import { useSession } from "@/lib/session";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function SuccessScreen() {
  const router = useRouter();
  const { account, loading } = useSession();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!account) router.replace("/");
    else if (!account.profileComplete) router.replace("/signup/username");
  }, [account, loading, router]);

  const avatar = avatarById(account?.avatarId);

  const inviteLink =
    account?.username && typeof window !== "undefined"
      ? `${window.location.origin}/u/${account.username}`
      : "";

  const share = async () => {
    const text = `Come find me on Dolemon — it's just us. ${inviteLink}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Dolemon", text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Invite copied");
        setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink">
      <BrandBlob />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 safe-t">
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="relative mb-8"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0.5 }}
              animate={{ scale: 1.25, opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border border-success/40"
            />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-success/25 bg-success/10 shadow-[0_0_70px_-16px_rgba(74,222,128,0.7)]">
              <motion.svg
                viewBox="0 0 24 24"
                className="h-10 w-10 text-success"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M4 12.5l5 5L20 6.5"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }}
                />
              </motion.svg>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.15 }}
            className="text-balance text-[30px] font-semibold leading-tight tracking-[-0.02em]"
          >
            You&apos;re all set.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.2 }}
            className="mt-3 max-w-[20rem] text-[15px] leading-relaxed text-text-muted"
          >
            Your space is ready. Invite the one person who matters and say hi.
          </motion.p>

          {account?.username && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: 0.28 }}
              className="mt-7 flex items-center gap-3 rounded-full border border-ink-line bg-ink-surface/80 py-2 pl-2 pr-5"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                style={{
                  backgroundColor: avatar?.bg ?? "rgba(255,92,122,0.16)",
                  boxShadow: `0 0 0 1px ${(avatar?.ring ?? "#FF5C7A")}33`,
                }}
              >
                {avatar?.emoji ?? "💬"}
              </span>
              <span className="text-[15px] font-medium">@{account.username}</span>
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: EASE, delay: 0.34 }}
          className="space-y-3 pb-8 safe-b"
        >
          <Button size="lg" className="w-full" onClick={() => router.replace("/app")}>
            Start chatting
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="default" className="w-full" onClick={share}>
            <Share2 className="h-4 w-4" />
            {copied ? "Invite copied" : "Invite your person"}
          </Button>
        </motion.div>
      </div>
    </main>
  );
}
