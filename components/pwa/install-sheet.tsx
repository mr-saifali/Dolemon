"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Download, Share, Smartphone } from "lucide-react";
import { usePwa } from "./pwa-provider";
import { APP_VERSION } from "@/lib/version";

/** Bottom sheet that either fires the native install prompt or explains how to add it by hand. */
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { canInstall, ios, installed, install } = usePwa();

  const run = async () => {
    const result = await install();
    if (result === "accepted") {
      toast.success("Installing Dolemon");
      onClose();
    } else if (result === "dismissed") {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Install Dolemon"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="relative w-full max-w-md rounded-t-[26px] border border-white/[0.07] bg-[#111113] px-6 pb-[max(env(safe-area-inset-bottom),26px)] pt-6 sm:rounded-[26px]"
          >
            <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-white/15 sm:hidden" />

            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] border border-white/10 bg-[#0C0C0F]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/icon-192.png" alt="" className="h-full w-full object-cover" />
              </span>
              <div>
                <h3 className="text-[17px] font-medium tracking-[-0.01em] text-zinc-100">
                  Dolemon on your home screen
                </h3>
                <p className="text-[12px] text-zinc-500">v{APP_VERSION} · opens full screen, no browser bars</p>
              </div>
            </div>

            {installed ? (
              <p className="mt-5 rounded-2xl bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-zinc-400">
                Already installed. Open it from your home screen — it stays signed in.
              </p>
            ) : canInstall ? (
              <button
                type="button"
                onClick={() => void run()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF5C7A] to-[#FF8FA3] py-3.5 text-[14.5px] font-medium text-white shadow-[0_10px_30px_-8px_rgba(255,92,122,0.55)]"
              >
                <Download className="h-4 w-4" />
                Install the app
              </button>
            ) : ios ? (
              <ol className="mt-5 space-y-3">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] text-zinc-300">
                    1
                  </span>
                  <span className="text-[13px] leading-relaxed text-zinc-400">
                    In Safari, tap <Share className="inline h-3.5 w-3.5 align-[-2px] text-zinc-300" />{" "}
                    <span className="text-zinc-200">Share</span>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] text-zinc-300">
                    2
                  </span>
                  <span className="text-[13px] leading-relaxed text-zinc-400">
                    Scroll down and tap <span className="text-zinc-200">Add to Home Screen</span>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] text-zinc-300">
                    3
                  </span>
                  <span className="text-[13px] leading-relaxed text-zinc-400">
                    It appears like any other app — same account, same chats.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="mt-5 space-y-3">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] text-zinc-300">
                    1
                  </span>
                  <span className="text-[13px] leading-relaxed text-zinc-400">
                    Open the browser menu (<span className="text-zinc-200">⋮</span>).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] text-zinc-300">
                    2
                  </span>
                  <span className="text-[13px] leading-relaxed text-zinc-400">
                    Choose <span className="text-zinc-200">Install app</span> or{" "}
                    <span className="text-zinc-200">Add to Home screen</span>.
                  </span>
                </li>
              </ol>
            )}

            <p className="mt-5 flex items-start gap-2 text-[11.5px] leading-relaxed text-zinc-600">
              <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No app store, no update screens — it always runs the newest version.
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-white/[0.06] py-2.5 text-[13px] text-zinc-300 transition-colors hover:bg-white/[0.1]"
            >
              Close
            </button>

            <div className="mt-3 text-center">
              <Link
                href="/download"
                onClick={onClose}
                className="text-[12px] text-zinc-500 underline-offset-4 transition-colors hover:text-rose hover:underline"
              >
                Other device or browser?
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
