/** @type {import('tailwindcss').Config} */
/**
 * Aura mobile Tailwind / NativeWind theme.
 * Source of truth: docs/design/tokens.md (UI v3 navy + Aura cyan, locked 2026-08-28).
 * Contract: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 *
 * Colors remap to CSS `var(--*)` from global.css (ThemeProvider class light|dark).
 * Keep darkMode: "class" — media mode throws from css-interop on setColorScheme.
 */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./index.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // NativeWind/css-interop: default "media" forbids colorScheme.set() and throws on web
  // when the darkMode flag is injected. ThemeProvider drives class light|dark.
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        app: "var(--bg-app)",
        elevated: "var(--bg-elevated)",
        muted: "var(--bg-muted)",
        overlay: "var(--bg-overlay)",
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
          focus: "var(--border-focus)",
        },
        // Session stage — force_dark (theme-stable)
        stage: {
          DEFAULT: "var(--stage-bg)",
          elevated: "var(--stage-elevated)",
          vignette: "var(--stage-vignette)",
        },
        glass: {
          fill: "var(--glass-fill)",
          border: "var(--glass-border)",
        },
        // Text (ink)
        ink: {
          DEFAULT: "var(--text)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          "on-accent": "var(--text-on-accent)",
          "on-danger": "var(--text-on-danger)",
          "on-stage": "var(--text-on-stage)",
        },
        // ONE accent — primary CTA / PTT only
        accent: {
          DEFAULT: "var(--accent)",
          pressed: "var(--accent-pressed)",
          muted: "var(--accent-muted)",
          glow: "var(--accent-glow)",
          ink: "var(--accent-ink)",
        },
        persona: {
          interviewer: "var(--persona-tint-interviewer)",
          buddy: "var(--persona-tint-buddy)",
        },
        // Semantic status (never replace accent)
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        "danger-ink": "var(--danger-ink)",
        info: "var(--info)",
        "info-ink": "var(--info-ink)",
        "neutral-status": "var(--neutral-status)",
        // Session / waveform
        waveform: {
          idle: "var(--waveform-idle)",
          active: "var(--waveform-active)",
          track: "var(--waveform-track)",
        },
        caption: {
          fill: "var(--caption-fill)",
          border: "var(--caption-border)",
        },
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        // UI v3: lg 16 / xl 20 / 2xl 28
        lg: "16px",
        xl: "20px",
        "2xl": "28px",
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
        // Layout constants from Design Contract (UI v3 PTT 80/88)
        ptt: "80px",
        "ptt-hit": "88px",
        header: "56px",
        tabbar: "56px",
      },
      fontSize: {
        // UI v3 type roles
        display: ["30px", { lineHeight: "36px", fontWeight: "700" }],
        title: ["24px", { lineHeight: "30px", fontWeight: "600" }],
        section: ["17px", { lineHeight: "22px", fontWeight: "600" }],
        body: ["16px", { lineHeight: "24px", fontWeight: "400" }],
        button: ["16px", { lineHeight: "20px", fontWeight: "600" }],
        meta: ["13px", { lineHeight: "18px", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "16px", fontWeight: "400" }],
      },
    },
  },
  plugins: [],
};
