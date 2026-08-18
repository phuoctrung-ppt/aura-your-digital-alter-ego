/** @type {import('tailwindcss').Config} */
/**
 * Aura mobile Tailwind / NativeWind theme.
 * Source of truth: docs/design/tokens.md (M6 lock 2026-08-17).
 * Contract: docs/design/2026-08-17-aura-mobile-mvp.spec.md
 *
 * Dark-first Digital Presence — one accent (#2DD4BF) for primary CTA/PTT only.
 */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./index.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Surfaces
        app: "#0B1220",
        elevated: "#141C2E",
        muted: "#1B2538",
        border: {
          DEFAULT: "#243047",
          strong: "#33415C",
          focus: "#2DD4BF",
        },
        // Text (ink)
        ink: {
          DEFAULT: "#F5F7FA",
          secondary: "#A8B3C7",
          muted: "#6B7A94",
          "on-accent": "#042F2E",
          "on-danger": "#FEF2F2",
        },
        // ONE accent — primary CTA / PTT only
        accent: {
          DEFAULT: "#2DD4BF",
          pressed: "#14B8A6",
          muted: "rgba(45, 212, 191, 0.16)",
        },
        // Semantic status (never replace accent)
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F87171",
        info: "#38BDF8",
        "neutral-status": "#94A3B8",
        // Session / waveform
        waveform: {
          idle: "#33415C",
          active: "#2DD4BF",
          track: "#1B2538",
        },
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        full: "9999px",
      },
      // Contract spacing scale only: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
        16: "64px",
        // Layout constants from Design Contract
        ptt: "80px",
        "ptt-hit": "88px",
        header: "56px",
        tabbar: "56px",
      },
      fontSize: {
        display: ["28px", { lineHeight: "34px", fontWeight: "700" }],
        title: ["22px", { lineHeight: "28px", fontWeight: "600" }],
        section: ["16px", { lineHeight: "22px", fontWeight: "600" }],
        body: ["16px", { lineHeight: "24px", fontWeight: "400" }],
        button: ["16px", { lineHeight: "20px", fontWeight: "600" }],
        meta: ["13px", { lineHeight: "18px", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "16px", fontWeight: "400" }],
      },
    },
  },
  plugins: [],
};
