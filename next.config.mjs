/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/", destination: "/app", permanent: false }];
  },
  async headers() {
    return [{
      source: "/downloads/dolemon-test-1.0.0.apk",
      headers: [
        { key: "Content-Type", value: "application/vnd.android.package-archive" },
        { key: "Content-Disposition", value: 'attachment; filename="Dolemon-test-1.0.0.apk"' },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] },
};
export default nextConfig;
