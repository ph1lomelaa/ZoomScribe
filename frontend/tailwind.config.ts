import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0F172A",
        surface: "#F8FAFC",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-dot": "pulse-dot 1.5s ease-in-out infinite",
        "slide-up": "slide-up 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "thinking-dot": "thinking-dot 1.2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        "slide-up": {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "thinking-dot": {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "50%": { transform: "translateY(-4px)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
