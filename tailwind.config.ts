import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0E0E11", surface: "#1A1A1F", raised: "#22222A", line: "#2C2C35" },
        rose: { DEFAULT: "#FF5C7A", soft: "#FF8AA0", deep: "#E14463" },
        peach: { DEFAULT: "#FFA07A", soft: "#FFC4A3" },
        violet: { DEFAULT: "#A78BFA", soft: "#C4B5FD" },
        mint: { DEFAULT: "#5EEAD4", soft: "#A7F3D0" },
        sky: { DEFAULT: "#7DD3FC", soft: "#BAE6FD" },
        amber: { DEFAULT: "#FCD34D", soft: "#FDE68A" },
        text: { DEFAULT: "#F5F5F7", muted: "#8E8E93" },
        success: "#4ADE80",
        danger: "#FF6B6B",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      borderRadius: { xl2: "16px", field: "12px" },
      boxShadow: {
        glow: "0 0 60px -12px rgba(255,92,122,0.55)",
        card: "0 24px 60px -24px rgba(0,0,0,0.75)",
        lift: "0 10px 34px -14px rgba(0,0,0,0.85)",
      },
      transitionTimingFunction: {
        ios: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      backgroundImage: {
        "vibrant": "linear-gradient(100deg, #FF5C7A 0%, #FFA07A 42%, #FFD7A8 100%)",
        "vibrant-cool": "linear-gradient(100deg, #A78BFA 0%, #7DD3FC 100%)",
        "vibrant-mixed": "linear-gradient(100deg, #FF5C7A 0%, #A78BFA 55%, #7DD3FC 100%)",
      },
      keyframes: {
        blob: { "0%,100%": { transform: "translate3d(0,0,0) scale(1)" }, "50%": { transform: "translate3d(-12px,14px,0) scale(1.06)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        spinSlow: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
        pulseSoft: { "0%,100%": { opacity: "0.45", transform: "scale(0.85)" }, "50%": { opacity: "1", transform: "scale(1.15)" } },
        riseIn: { from: { opacity: "0", transform: "translate3d(0,8px,0)" }, to: { opacity: "1", transform: "translate3d(0,0,0)" } },
      },
      animation: {
        blob: "blob 14s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "spin-slow": "spinSlow 26s linear infinite",
        "spin-slow-reverse": "spinSlow 32s linear infinite reverse",
        "pulse-soft": "pulseSoft 3.4s ease-in-out infinite",
        "rise-in": "riseIn 0.42s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
