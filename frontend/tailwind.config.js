/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F4F0",
        panel: "#FFFFFF",
        ink: "#14162B",
        subink: "#5B5D72",
        line: "#E3E1D8",
        source: {
          DEFAULT: "#33477C",
          soft: "#E9ECF6",
        },
        research: {
          DEFAULT: "#B4791B",
          soft: "#F8ECD8",
        },
        chat: {
          DEFAULT: "#1F7A6C",
          soft: "#E3F1EC",
        },
        quiz: {
          DEFAULT: "#7A3B8F",
          soft: "#F1E5F5",
        },
        verifier: {
          DEFAULT: "#2D7A3E",
          soft: "#E5F3E7",
        },
        podcast: {
          DEFAULT: "#C84B31",
          soft: "#FDF0ED",
        },
        // Dark-mode surfaces - kept in the same warm/editorial family as
        // the light palette (deep ink-blue, not generic near-black).
        dcanvas: "#0E1020",
        dpanel: "#171A30",
        dpanel2: "#1E2138",
        dline: "#2C2F4A",
        dink: "#F1F0EA",
        dsubink: "#9B9DB8",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(20, 22, 43, 0.08)",
        "glass-dark": "0 8px 32px rgba(0, 0, 0, 0.35)",
        floating: "0 12px 40px rgba(20, 22, 43, 0.12)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-slow": "pulse 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        travel: "travel 1.6s ease-in-out infinite",
        "fade-in": "fadeIn 0.35s ease-out both",
        "fade-up": "fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in": "slideIn 0.25s ease-out both",
        shimmer: "shimmer 1.8s linear infinite",
        "scale-in": "scaleIn 0.18s ease-out both",
        blink: "blink 1s step-start infinite",
      },
      keyframes: {
        travel: {
          "0%": { transform: "translateY(0%)", opacity: "0" },
          "15%": { opacity: "1" },
          "85%": { opacity: "1" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-6px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-500px 0" },
          "100%": { backgroundPosition: "500px 0" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        blink: {
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
