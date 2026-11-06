import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { MotionPrefs } from "@/components/motion-prefs";
import { ThemePrefs } from "@/components/theme-prefs";
import { LiveCallProvider } from "@/lib/live-call";
import { LiveCallOverlay } from "@/components/call/live-call-overlay";
import { SessionProvider } from "@/lib/session";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { NetworkStatus } from "@/components/pwa/network-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dolemon — a private space for two",
  description: "A private, invite-only space for 1:1 conversations. No groups. No noise.",
  applicationName: "Dolemon",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Dolemon" },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/icons/icon-192.png"],
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
    { media: "(prefers-color-scheme: light)", color: "#09090B" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ThemePrefs>
        <MotionPrefs>
        <PwaProvider>
          <SessionProvider>
            <LiveCallProvider>
              {children}
              <LiveCallOverlay />
              <NetworkStatus />
            </LiveCallProvider>
          </SessionProvider>
        </PwaProvider>
        </MotionPrefs>
        </ThemePrefs>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#1A1A1F",
              border: "1px solid #2C2C35",
              color: "#F5F5F7",
              borderRadius: "12px",
            },
          }}
        />
      </body>
    </html>
  );
}
