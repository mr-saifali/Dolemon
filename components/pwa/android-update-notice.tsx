"use client";

import { useEffect, useState } from "react";
import { ANDROID_APK_FILENAME, ANDROID_APK_URL, ANDROID_APP_VERSION, androidUpdateTarget, type AndroidUpdateTarget } from "@/lib/android-app";

const DISMISS_KEY = `dolemon:android-update-dismissed:${ANDROID_APP_VERSION}`;

/** Website-delivered notice; old WebView shells cannot receive native push. */
export function AndroidUpdateNotice() {
  const [target, setTarget] = useState<AndroidUpdateTarget>(null);

  useEffect(() => {
    const detected = androidUpdateTarget(navigator.userAgent);
    if (!detected) return;
    try { if (sessionStorage.getItem(DISMISS_KEY) === "1") return; } catch { /* still show if storage is unavailable */ }
    setTarget(detected);
  }, []);

  if (!target) return null;
  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* dismissal still works for this render */ }
    setTarget(null);
  };

  return (
    <aside aria-label="Android app update" className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] mx-auto max-w-md rounded-2xl border border-white/15 bg-[#202028] p-4 text-zinc-100 shadow-2xl">
      <p className="text-sm font-semibold">Android app update available</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-300">
        {target === "unmarked-webview" ? "If you’re using the older Dolemon Android app, " : "A newer Dolemon Android test app is available. "}
        {target === "unmarked-webview" ? `test version ${ANDROID_APP_VERSION} is available.` : `Latest test version: ${ANDROID_APP_VERSION}.`}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-amber-200">
        Versions 1.0 and 1.1 use different signing keys from 1.2: uninstall the old app before installing this test APK. Uninstalling erases its local app data. Back up anything important first.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">Internet is required. Your browser will open to download the APK.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={ANDROID_APK_URL} download={ANDROID_APK_FILENAME} className="rounded-full bg-rose px-4 py-2 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Download latest APK</a>
        <button type="button" onClick={dismiss} className="rounded-full px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Not now</button>
      </div>
    </aside>
  );
}
