/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/", destination: "/app", permanent: false }];
  },
  async headers() {
    return ["1.0.0", "1.1.0", "1.2.0"].map((version) => ({
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
