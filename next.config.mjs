/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // One id per build: the Android shell compares it with /api/app-version and
  // re-opens the site when the phone is still running an older bundle.
  env: { NEXT_PUBLIC_APP_BUILD: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()) },
  async redirects() {
    return [{ source: "/", destination: "/app", permanent: false }];
  },
  async headers() {
    return ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"].map((version) => ({
      source: `/downloads/dolemon-test-${version}.apk`,
      headers: [
        { key: "Content-Type", value: "application/vnd.android.package-archive" },
        { key: "Content-Disposition", value: `attachment; filename="Dolemon-test-${version}.apk"` },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }));
  },
  experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] },
};
export default nextConfig;
