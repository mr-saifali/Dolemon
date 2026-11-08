"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, Laptop, Share, Smartphone } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { APP_RELEASE_NAME, APP_VERSION } from "@/lib/version";
import { ANDROID_APK_URL, ANDROID_APK_FILENAME, ANDROID_APP_VERSION } from "@/lib/android-app";

const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  {
    icon: Smartphone,
    title: "Android · Test APK",
    steps: ["Download the APK from this page", "Open the downloaded file; if prompted, allow installs from your browser", "Install and open Dolemon — internet is required"],
  },
  {
    icon: Smartphone,
    title: "iPhone · Safari",
    steps: ["Tap the Share icon in the toolbar", "Choose “Add to Home Screen”", "Tap Add — it opens full screen"],
  },
  {
    icon: Smartphone,
    title: "Android · Chrome",
    steps: ["Open the ⋮ menu", "Tap “Install app” or “Add to Home screen”", "Confirm — it lands in your app drawer"],
  },
  {
    icon: Laptop,
    title: "Desktop · Chrome / Edge",
    steps: ["Click the install icon in the address bar", "Choose Install", "It opens in its own window"],
  },
];

export default function DownloadPage() {
  const { canInstall, installed, install, androidApp, environmentReady } = usePwa();

  const run = async () => {
    const result = await install();
    if (result === "accepted") toast.success("Installing Dolemon");
    else if (result === "unavailable") toast("Use the steps below to add it by hand.");
  };

  if (!environmentReady) return <main aria-busy="true" className="min-h-dvh bg-[#09090B]" />;
  if (androidApp) return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#09090B] px-6 text-center">
      <p className="text-zinc-200">You’re already using the Android app.</p>
      <Link href="/app" className="rounded-full bg-white/10 px-5 py-3 text-sm text-white">Back to Dolemon</Link>
    </main>
  );

  return (
    <main className="relative isolate flex min-h-dvh flex-col bg-[#09090B]">
      <div className="mx-auto w-full max-w-md flex-1 px-6 pb-14 safe-t safe-b">
        <header className="flex items-center gap-3 pt-7">
          <Link
            href="/"
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-[13px] tracking-wide text-zinc-500">Download</span>
        </header>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="mt-10 flex flex-col items-center text-center"
        >
          <div className="h-[88px] w-[88px] overflow-hidden rounded-[22px] border border-white/10 shadow-[0_18px_50px_-18px_rgba(255,92,122,0.45)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-512.png?v=2" alt="Dolemon" className="h-full w-full object-cover" />
          </div>

          <h1 className="mt-6 text-[26px] font-medium leading-tight tracking-[-0.02em] text-zinc-100">
            Get Dolemon
          </h1>
          <p className="mt-2 max-w-[17rem] text-[13.5px] leading-relaxed text-zinc-500">
            Download the Android test app, or install the browser version on your home screen.
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose" />
            Browser app v{APP_VERSION} · {APP_RELEASE_NAME}
          </div>

          <a
            href={ANDROID_APK_URL}
            download={ANDROID_APK_FILENAME}
            className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14.5px] font-medium text-white shadow-[0_12px_34px_-10px_var(--glow-send)] transition-transform active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            style={{ background: "var(--brand-grad)" }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download Android APK
          </a>
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            Test build v{ANDROID_APP_VERSION} for Android 8 or later. Chats you have opened stay readable offline; sending and receiving need internet. Notifications need a real browser engine (Android&apos;s WebView has no push API), so turn them on from Chrome — the app links you there. Test builds cannot upgrade in place: uninstall the old app first; uninstalling erases its local app data. Your chats stay on the server.
          </p>

          {canInstall ? (
            <button
              type="button"
              onClick={() => void run()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.15] py-3.5 text-[14.5px] font-medium text-zinc-100 transition-transform active:scale-[0.99]"
            >
              <Download className="h-4 w-4" />
              Install browser app
            </button>
          ) : installed ? (
            <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-rose/25 bg-rose/[0.08] py-3.5 text-[14px] font-medium text-rose">
              <Check className="h-4 w-4" />
              Installed on this device
            </div>
          ) : (
            <Link
              href="/app"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[14.5px] font-medium text-[#09090B] transition-transform active:scale-[0.99]"
            >
              Open in browser
            </Link>
          )}

          {installed && (
            <Link
              href="/app"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.09] py-3.5 text-[14px] font-medium text-zinc-200"
            >
              Open Dolemon
            </Link>
          )}
        </motion.div>

        <div className="mt-11 space-y-3">
          {STEPS.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: EASE, delay: 0.08 + index * 0.06 }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="flex items-center gap-2">
                <card.icon className="h-3.5 w-3.5 text-rose" />
                <h2 className="text-[13px] font-medium text-zinc-200">{card.title}</h2>
              </div>
              <ul className="mt-2.5 list-none space-y-1.5">
                {card.steps.map((step, i) => (
                  <li key={step} className="flex gap-2.5 text-[12.5px] leading-relaxed text-zinc-500">
                    <span className="text-zinc-600">{i + 1}.</span>
                    <span>
                      {step.includes("Share") ? (
                        <>
                          Tap the <Share className="inline h-3 w-3 align-[-2px] text-zinc-400" /> Share icon
                          in the toolbar
                        </>
                      ) : (
                        step
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-[11.5px] leading-relaxed text-zinc-600">
          The Android test app and browser app connect to the same hosted Dolemon service. The APK is not a Play Store release.
        </p>
      </div>
    </main>
  );
}
