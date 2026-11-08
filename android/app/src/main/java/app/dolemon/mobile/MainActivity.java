package app.dolemon.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** Small Android shell for the hosted app. Never grants camera/mic to other origins. */
public final class MainActivity extends Activity {
    private static final String ORIGIN_HOST = "dolemon.vercel.app";
    /** Keep in step with android/app/build.gradle and lib/android-app.ts. */
    private static final String APP_VERSION = "1.4.0";
    private static final String START_URL = "https://dolemon.vercel.app/app";
    private static final int FILE_PICKER = 1001;
    private static final int MEDIA_PERMISSIONS = 1002;
    /** First arrival in the inbox: ask for camera, mic and notifications, once. */
    private static final int PERMISSION_PRIMER = 1003;
    private static final String PREFS = "dolemon-shell";
    private static final String KEY_PRIMER_DONE = "permissions-asked-v1";
    private static final String CHANNEL_ID = "messages";
    private static final int NOTIFICATION_ID = 4101;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermission;
    private String[] pendingResources;

    private static boolean trusted(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && ORIGIN_HOST.equalsIgnoreCase(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private void openExternal(Uri uri) {
        if (uri == null || !("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException ignored) { Toast.makeText(this, "No browser is available", Toast.LENGTH_SHORT).show(); }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
        getWindow().setStatusBarColor(Color.rgb(9, 9, 11));
        getWindow().setNavigationBarColor(Color.rgb(9, 9, 11));
        // Same colour as the page, so the first paint never flashes white.
        webView.setBackgroundColor(Color.rgb(9, 9, 11));
        // No glow, no scrollbars: a native list does not do either.
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        ensureNotificationChannel();

        WebSettings settings = webView.getSettings();
        // Identify this shell so the hosted site does not offer to install it again.
        settings.setUserAgentString(settings.getUserAgentString() + " DolemonAndroid/" + APP_VERSION);
        settings.setJavaScriptEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(true);
        // The page is already responsive; pinch-to-zoom and Android's own font
        // scaling make it read as a shrunk-down website.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setTextZoom(100);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (trusted(uri)) return false;
                if (request.isForMainFrame()) openExternal(uri);
                return request.isForMainFrame();
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // "First arrival in the inbox" — the launcher start URL. Android
                // shows its own dialogs; the answer is remembered either way.
                if (url != null && url.startsWith(START_URL)) askPermissionsOnce();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_PICKER); return true; }
                catch (ActivityNotFoundException e) { fileCallback = null; return false; }
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, android.os.Message resultMsg) {
                if (!userGesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                        Uri uri = request.getUrl();
                        if (request.isForMainFrame()) {
                            // Everything that belongs to us opens *in* the app;
                            // only other companies' sites leave for a browser.
                            if (trusted(uri)) webView.loadUrl(uri.toString()); else openExternal(uri);
                            child.post(child::destroy);
                        }
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> requestMediaPermission(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingPermission == request) { pendingPermission = null; pendingResources = null; }
            }
        });
        webView.setDownloadListener((url, agent, disposition, mime, size) -> {
            Uri uri = Uri.parse(url);
            if ("blob".equalsIgnoreCase(uri.getScheme())) Toast.makeText(this, "Open Dolemon in your browser to save this file", Toast.LENGTH_LONG).show();
            else openExternal(uri);
        });
        // A deliberately tiny bridge. The site can ask which build this is, hand
        // a link to the real browser, and ask for one notification. It cannot
        // touch native storage, files or the camera without the WebChromeClient
        // asking first.
        webView.addJavascriptInterface(new Bridge(), "DolemonAndroid");
        webView.loadUrl(START_URL);
    }

    /** Called from JavaScript as window.DolemonAndroid.*. Runs on the JS thread. */
    public final class Bridge {
        @JavascriptInterface public String version() { return APP_VERSION; }

        /**
         * Open one of our own screens in the default browser. Web Push needs a
         * real browser engine (Android WebView has no Push API), so the site
         * uses this when someone asks for notifications inside the app.
         */
        @JavascriptInterface public void openInBrowser(final String path) {
            String safe = path != null && path.matches("^/[A-Za-z0-9/_-]{0,120}$") ? path : "/app";
            runOnUiThread(() -> openExternal(Uri.parse("https://" + ORIGIN_HOST + safe)));
        }

        /** Post a message notification from inside the running shell. */
        @JavascriptInterface public void notifyMessage(final String title, final String body) {
            final String safeTitle = oneLine(title, 80);
            final String safeBody = oneLine(body, 200);
            if (safeTitle.isEmpty() || safeBody.isEmpty()) return;
            runOnUiThread(() -> postNotification(safeTitle, safeBody));
        }
    }

    private static String oneLine(String value, int max) {
        if (value == null) return "";
        String flat = value.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ').trim();
        return flat.length() > max ? flat.substring(0, max) : flat;
    }

    private void ensureNotificationChannel() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("New messages while Dolemon is running");
        manager.createNotificationChannel(channel);
    }

    private boolean canNotify() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return manager != null && manager.areNotificationsEnabled();
    }

    private void postNotification(String title, String body) {
        if (!canNotify()) return;
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(tap)
                .build();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification);
    }

    /** Camera, microphone and notifications, asked on the first inbox visit only. */
    private void askPermissionsOnce() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_PRIMER_DONE, false)) return;
        // Record the ask *before* showing it: Android remembers a denial, and
        // asking again on every launch is exactly what "only one time" forbids.
        prefs.edit().putBoolean(KEY_PRIMER_DONE, true).apply();
        List<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.CAMERA);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (missing.isEmpty()) return;
        requestPermissions(missing.toArray(new String[0]), PERMISSION_PRIMER);
    }

    private void requestMediaPermission(PermissionRequest request) {
        if (!trusted(request.getOrigin()) || pendingPermission != null) { request.deny(); return; }
        List<String> resources = new ArrayList<>();
        List<String> androidPermissions = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission;
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) permission = Manifest.permission.RECORD_AUDIO;
            else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) permission = Manifest.permission.CAMERA;
            else { request.deny(); return; }
            resources.add(resource);
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) androidPermissions.add(permission);
        }
        if (resources.isEmpty()) { request.deny(); return; }
        String[] allowed = resources.toArray(new String[0]);
        if (androidPermissions.isEmpty()) { request.grant(allowed); return; }
        pendingPermission = request;
        pendingResources = allowed;
        requestPermissions(androidPermissions.toArray(new String[0]), MEDIA_PERMISSIONS);
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        // The primer has nothing pending in the web page — it only warms the
        // system dialogs so a later camera tap does not have to.
        if (code == PERMISSION_PRIMER) return;
        if (code != MEDIA_PERMISSIONS || pendingPermission == null) return;
        boolean granted = results.length > 0;
        for (int result : results) granted &= result == PackageManager.PERMISSION_GRANTED;
        if (granted) pendingPermission.grant(pendingResources); else pendingPermission.deny();
        pendingPermission = null;
        pendingResources = null;
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE_PICKER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        ensureNotificationChannel();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (pendingPermission != null) pendingPermission.deny();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
