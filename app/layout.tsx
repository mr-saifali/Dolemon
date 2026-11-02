import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { LiveCallProvider } from "@/lib/live-call";
import { LiveCallOverlay } from "@/components/call/live-call-overlay";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dolemon — a private space for two",
  description: "A private, invite-only space for 1:1 conversations. No groups. No noise.",
  applicationName: "Dolemon",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Dolemon" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0E0E11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SessionProvider>
          <LiveCallProvider>
            {children}
            <LiveCallOverlay />
          </LiveCallProvider>
        </SessionProvider>
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
