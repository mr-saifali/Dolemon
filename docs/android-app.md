# Dolemon Android test APK

This is an Android WebView shell for the existing HTTPS service at `https://dolemon.vercel.app`, not a native rewrite. It requires the hosted site once, then inherits the web app's offline reading: the WebView runs the same service worker, so screens visited online reopen without a connection, and the account-scoped IndexedDB cache keeps the newest messages of every chat. Sending, calling and new messages still need a connection. External HTTP(S) links open in the device browser. File selection and camera/microphone permissions are implemented in the shell, but have not yet been verified on physical devices. Web Push is not supported by standard Android WebView; the existing installed Chrome PWA is the option for web push once configured. From 1.4.0 the shell does post system notifications for messages that arrive while it is running, through its own bridge. Device codecs, Android WebView version, OS permissions, downloads (especially `blob:` links), calls, uploads, and background behavior can differ from Chrome. Do not rely on this APK for push notifications or important calls without device tests.

The GitHub Actions workflow builds a **debug-signed test APK**. Android may require allowing installation from the downloading source. This is not a Play Store release and the debug key generated on a CI runner changes between builds, so later builds may require uninstalling this one first, which can erase local app data. For a distributable app, establish an owner-controlled persistent release signing key and safe backup outside this repository; never commit a key or password, and test an upgrade. Building an APK does not deploy the website or apply any Supabase migrations. Changes in this branch appear inside the APK only after they are deployed to the hosted service.

## Build locally

Install JDK 17, Android SDK platform 35 and Gradle 8.10.2. From `android/`, run `gradle assembleDebug`; the output is `app/build/outputs/apk/debug/app-debug.apk`. Or run the **Android test APK** GitHub Actions workflow and download its artifact. Use only the official project repository to obtain builds. Before distributing, test two real Android devices for login/logout, message delivery and receipts, links, file/video selection, voice/video permission prompts, calls, back navigation, app suspension and reinstall/upgrade. Existing backend and push/video setup requirements still apply.

## Previous 1.1.0 test download

`public/downloads/dolemon-test-1.1.0.apk` is the debug-signed APK built by [GitHub Actions run 42372402860](https://github.com/mr-saifali/Dolemon/actions/runs/42372402860), from commit `1bd278e25ea675e3c3d36ab859453287910c34a4`. SHA-256: `44b761256629bafd7193d3b44777d93a1fbc03d0497ceebe737890763aebbea4`. It uses Android package `app.dolemon.mobile`, version code 2 and version name 1.1.0, and loads the production web service; the website determines the actual web features available. The app-identifying user-agent marker suppresses APK/install promotions inside the Android WebView. Older unmarked Android WebViews are also treated as embedded apps to avoid displaying install prompts there; this includes third-party Android WebViews.

This remains a **test build**, not a signed official release or Play Store-ready APK. The 1.0.0 and 1.1.0 test APKs remain at their original URLs for older bookmarks; the website currently links to 1.4.1. The CI debug key differs from the published 1.0.0 build, so installing 1.1.0 over 1.0.0 fails. Uninstalling 1.0.0 first erases its local app data. The 1.0.0 certificate SHA-256 is `b517f8a4d6d1d9cf86a039b675e7ca499bc5cc314baf65482a14fbe886231edd`; the 1.1.0 certificate SHA-256 is `96c3edcf700f0c2ebf5a0df05d7409284cfd7ecd9d08bd51624edd035e8d566d`. No physical-device verification has been performed. Later shells inherit web offline reading and add running-app notifications; native device-lock access and closed-app WebView push remain unavailable. An owner-controlled release signing key, tested upgrade path, device verification and deployment setup are required for a true official release.

## Older-version update notice

The hosted website displays a dismissible in-app update notice when an identified Dolemon Android shell is older than the current published test APK. Because 1.0.0 has no identifying marker, the notice is also shown, with conditional wording, in unmarked Android WebViews; these can include third-party apps. Standard Android browsers, the current marked shell and newer marked shells do not see it. The download button points directly to the published test APK and the notice warns that incompatible test signing keys can require uninstalling the older app, erasing its local data. This notice only appears when an old app opens the hosted website online; it is not an Android push notification. Dismissal lasts for the current WebView session. When publishing a new APK, update the version, URL, filename, signature and installation warning together, and test the download on a real device.

## Published 1.2.0 online-only test APK

`public/downloads/dolemon-test-1.2.0.apk` is the debug-signed APK built by [Android test APK run 42386942348](https://github.com/mr-saifali/Dolemon/actions/runs/42386942348), from commit `6c3e63166db99c58696c97f76b2fb05624818778`. Package `app.dolemon.mobile`, Android versionCode 3, versionName 1.2.0. SHA-256: `278bc8a1f1710ed4e0486792b408f1aa69c4a13bfbfbdacc9c267047eea13d26`; signing certificate SHA-256: `af1e173d458aa7cb1417197ba0f5861999d860eb587faa728b3136565f2e01f1`. The CI verified its signature and package metadata.

This remains an **online-only test build**, not an offline-ready or Play Store release. The signing certificate differs from both the 1.0.0 and 1.1.0 test APKs: Android cannot upgrade either in place to this build. Uninstalling first erases the old app's local data; back up important data first. Older users see a website-delivered download notice when online, not a native push notification. No physical-device verification has been performed. Web changes appear inside the shell only after the site is deployed.


## Published 1.3.0 test APK (offline reading)

`public/downloads/dolemon-test-1.3.0.apk` is the debug-signed APK built by the **Android test APK** workflow from commit `7981415` after the merge of #50 (the Android workflow's first successful publish was run 42438756465). Package `app.dolemon.mobile`, Android versionCode 4, versionName 1.3.0, 74,261 bytes. SHA-256: `dc7bc19d4b29e4592f27b0adaa7ee4a133494a02ba67bafa71c28d4a336e9d49`. CI verified the v2 signature and the `versionCode='4' versionName='1.3.0'` badging before the workflow committed the binary here. Publishing is one-shot per version: a later build sees the file already present and stops, because every CI run produces different bytes (fresh debug key) and re-publishing would silently invalidate links and hashes. Bump `versionName` to ship a new build.

What is new over 1.2.0:

- The user-agent marker now reports the version from `MainActivity.APP_VERSION`, so the website's update notice can tell 1.2.0 from 1.3.0.
- A deliberately tiny JavaScript bridge (`DolemonAndroid.version()` and `DolemonAndroid.openInBrowser(path)`) lets the site send someone to Chrome for notifications. The path is validated as an in-app route and the origin is fixed; the bridge cannot read or write native storage.
- Offline reading works inside the shell because the hosted site now ships the offline-first service worker; the previous "online-only" caveat applied to the web layer.

WebView still has **no Push API**, so this APK cannot receive Web Push. Notifications are turned on in Chrome (or the installed browser app), where the same account, chat history and VAPID subscription apply. The settings screen says so and offers the hand-off instead of a toggle that cannot work.

The signing certificate differs from every previous test APK: Android cannot upgrade 1.0–1.2 in place. Uninstalling first erases the old app's local data. Existing users see the website-delivered update notice while online, with a download button; it is not a native push notification. A true official release still needs an owner-controlled signing key, a tested upgrade path and physical-device verification.

## Published 1.4.0 test APK (native feel)

`public/downloads/dolemon-test-1.4.0.apk` is the debug-signed APK built by the **Android test APK** workflow from commit `127f33b` (run 42441548804, which committed the binary itself). Package `app.dolemon.mobile`, Android versionCode 5, versionName 1.4.0, 77,553 bytes. SHA-256: `673bf17f90ffc26f4b02599ba709c3c11df705a0260a051640bdcfa8a72fbf5a`. The workflow verified the v2 signature, the `versionCode='5' versionName='1.4.0'` badging and that `MainActivity.APP_VERSION` matches `build.gradle` before publishing. Publishing stays one-shot per version.

What is new over 1.3.0:

- **Swipe down to refresh.** `components/pwa/pull-to-refresh.tsx` arms only inside the shell and only when the touched list is already at its top; screens reload their own data on `dolemon:refresh`. Browsers keep their own native refresh.
- **50 messages per page.** `/app/chat/[id]` opens with the latest 50 messages and every "Load older messages" tap adds 50 more (was 6 + 6).
- **Faster chat.** `lib/thread-identity.ts` reuses unchanged message objects, so polling, incoming messages and reactions no longer re-render every bubble; typing pings are throttled to one per 1.5 s.
- **Looks like an app.** Still launch screen instead of a spinner (the route loading frames are plain), a centred-icon splash drawable, no pinch/double-tap zoom, `textZoom` pinned at 100, no overscroll glow, no scrollbars, dark system bars, and shell-only CSS that removes tap flashes, selection handles and rubber-band scrolling.
- **The "…" menu opens.** Search, compare and chat-background panels are imported with the chat bundle instead of lazily, so a failed chunk fetch can no longer leave a menu item doing nothing.
- **Permissions once.** The first arrival at `/app` asks Android for camera, microphone and notifications, and records `permissions-asked-v1` in `dolemon-shell` preferences before showing the dialogs, so it never asks again after a denial.
- **Notification channel + bridge.** `DolemonAndroid.notifyMessage(title, body)` posts a system notification while the shell is running. It is not push: Android WebView has no Push API, so a message that arrives while the app is closed still cannot wake it. Chrome (with the VAPID setup) remains the only real background push path.
- **Self-updating shell.** `/api/app-version` exposes the build id baked in at build time; `ShellChrome` re-opens the site when the running bundle is older, so a phone that kept the app in memory for days picks up merged fixes.

The signing certificate again differs from every earlier test APK, so 1.0–1.3 cannot upgrade in place: uninstall first, which erases local app data (chats stay on the server). 1.3.0 and older now see the in-app update notice linking to this file.


## 1.4.1 — authenticated inbox permission primer

VersionCode 6 / versionName 1.4.1 supersedes the pre-release 1.4.0 build above.
It includes all the 1.4.0 changes, with a corrected permission entry point:
`HomeScreen`, which only mounts inside `AppGuard` after sign-in/unlock, calls
`DolemonAndroid.inboxReady()`. Native code checks the trusted origin and exact
inbox path, then uses the same persisted one-time flag. This works after
client-side sign-in navigation and never asks at the unauthenticated `/app`
redirect. Settings now distinguishes running-app alerts from unavailable
closed-app background push. Message identity reuse also compares reactions,
quoted text, media metadata and call details so optimization cannot hide edits.

The download and older-version notice target `dolemon-test-1.4.1.apk`.
This remains a debug-signed test APK; uninstalling an incompatible older build
clears local/offline data. Server-saved chats are unaffected. No physical-device
verification has been performed.


Published 1.4.1 provenance: [Android test APK run 42454494265](https://github.com/mr-saifali/Dolemon/actions/runs/42454494265),
built from `ca218ef18b5eafb0912320b3ab2cfa9a488a1652`, published by commit
`3795df8`. Size: 77,725 bytes. SHA-256:
`85b2e0b0f40f408d351d8f049dc6a9aab3ff208f56360631005f584e143c6c0a`.
CI verified the signature and package version before publishing. Web-only changes
following that build do not alter the APK; they arrive through the deployed site.

## Trust audit web release

The trust/verification changes are hosted web changes: the existing 1.4.1 shell
loads them after deployment and reopening online. No replacement APK or signing
key was generated. `lib/version.ts` reports web release 1.5.0, independently from
the Android 1.4.1 binary version. See `trust-audit.md` for remaining release gates.
