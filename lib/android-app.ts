/** The APK is a debug-signed test build, not a Play Store release. */
export const ANDROID_APK_URL = "/downloads/dolemon-test-1.1.0.apk";
export const ANDROID_APK_FILENAME = "Dolemon-test-1.1.0.apk";
export const ANDROID_APP_VERSION = "1.1.0";

/**
 * The shell adds a marker. Older versions used the unmodified Android WebView
 * user agent, so recognize that too. This intentionally suppresses install
 * prompts in other embedded Android WebViews, where APK downloads are often
 * unsupported; normal Android browsers continue to see them.
 */
export function isAndroidAppWebView(userAgent: string): boolean {
  return /DolemonAndroid\//i.test(userAgent) || (/Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent));
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
