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
