/** The APK is a debug-signed test build, not a Play Store release. */
export const ANDROID_APK_URL = "/downloads/dolemon-test-1.3.0.apk";
export const ANDROID_APK_FILENAME = "Dolemon-test-1.3.0.apk";
export const ANDROID_APP_VERSION = "1.3.0";

/**
 * The shell adds a marker. Older versions used the unmodified Android WebView
 * user agent, so recognize that too. This intentionally suppresses install
 * prompts in other embedded Android WebViews, where APK downloads are often
 * unsupported; normal Android browsers continue to see them.
 */
export function isAndroidAppWebView(userAgent: string): boolean {
  return /DolemonAndroid\//i.test(userAgent) || (/Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent));
}

/** True only inside our own shell — other WebViews must not get shell-specific UI. */
export function isDolemonAndroidShell(userAgent: string): boolean {
  return /DolemonAndroid\//i.test(userAgent);
}

type AndroidBridge = { version?: () => string; openInBrowser?: (path: string) => void };

function bridge(): AndroidBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { DolemonAndroid?: AndroidBridge }).DolemonAndroid;
  return candidate && typeof candidate === "object" ? candidate : null;
}

/** The installed shell's own version, when the bridge reports one. */
export function shellVersion(): string | null {
  try {
    const value = bridge()?.version?.();
    return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Web Push needs a real browser engine: Android WebView has no Push API, so a
 * subscription can only be made in Chrome (or another browser). Inside the
 * shell this hands the path to the native bridge.
 */
export function openInBrowser(path = "/settings"): boolean {
  const safe = /^\/[A-Za-z0-9/_-]{0,120}$/.test(path) ? path : "/settings";
  const native = bridge();
  if (native?.openInBrowser) {
    try {
      native.openInBrowser(safe);
      return true;
    } catch {
      return false;
    }
  }
  if (typeof window !== "undefined") {
    window.open(`https://dolemon.vercel.app${safe}`, "_blank", "noopener");
    return true;
  }
  return false;
}

export type AndroidUpdateTarget = "older-marked" | "unmarked-webview" | null;

/** Unmarked WebViews may be Dolemon 1.0, but may also belong to another app. */
export function androidUpdateTarget(userAgent: string, latestVersion = ANDROID_APP_VERSION): AndroidUpdateTarget {
  const marker = /DolemonAndroid\/(\d+)\.(\d+)\.(\d+)(?=\s|$)/i.exec(userAgent);
  if (marker) {
    const latest = /^(\d+)\.(\d+)\.(\d+)$/.exec(latestVersion);
    if (!latest) return null;
    for (let i = 1; i <= 3; i++) {
      const currentPart = Number(marker[i]);
      const latestPart = Number(latest[i]);
      if (currentPart !== latestPart) return currentPart < latestPart ? "older-marked" : null;
    }
    return null;
  }
  // An unknown marker isn't evidence of an older version.
  if (/DolemonAndroid\//i.test(userAgent)) return null;
  return /Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent) ? "unmarked-webview" : null;
}
