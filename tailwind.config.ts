import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0E0E11", surface: "#1A1A1F", raised: "#22222A", line: "#2C2C35" },
        rose: { DEFAULT: "#FF5C7A", soft: "#FF8AA0", deep: "#E14463" },
        text: { DEFAULT: "#F5F5F7", muted: "#8E8E93" },
        success: "#4ADE80",
        danger: "#FF6B6B",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      borderRadius: { xl2: "16px", field: "12px" },
      boxShadow: {
        glow: "0 0 60px -12px rgba(255,92,122,0.55)",
        card: "0 24px 60px -24px rgba(0,0,0,0.75)",
      },
      keyframes: {
        blob: { "0%,100%": { transform: "translate3d(0,0,0) scale(1)" }, "50%": { transform: "translate3d(-12px,14px,0) scale(1.06)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: { blob: "blob 14s ease-in-out infinite", shimmer: "shimmer 1.6s infinite" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
