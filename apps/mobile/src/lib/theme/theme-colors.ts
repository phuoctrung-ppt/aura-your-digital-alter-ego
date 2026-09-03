/**
 * Dual-theme + force_dark stage palettes for StyleSheet screens.
 * Source: docs/design/tokens.md (UI v3 navy + Aura cyan, locked 2026-08-28).
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 *
 * NativeWind className + CSS vars cover auth-style screens; StyleSheet
 * surfaces call `chromeColors(resolved)` / `stageColors` so light chrome
 * and force_dark session stay in sync without hardcoding one theme.
 */

import type { ResolvedColorScheme } from "./appearance-store";

export type ChromeColors = {
  bgApp: string;
  bgElevated: string;
  bgMuted: string;
  bgOverlay: string;
  border: string;
  borderStrong: string;
  borderFocus: string;
  glassFill: string;
  glassBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  textOnDanger: string;
  accent: string;
  accentPressed: string;
  accentMuted: string;
  accentGlow: string;
  accentInk: string;
  personaTintInterviewer: string;
  personaTintBuddy: string;
  success: string;
  warning: string;
  danger: string;
  dangerInk: string;
  dangerWash: string;
  dangerBorder: string;
  info: string;
  infoInk: string;
  infoWash: string;
  infoBorder: string;
  neutralStatus: string;
  waveformIdle: string;
  waveformActive: string;
  waveformTrack: string;
};

export type StageColors = {
  bg: string;
  elevated: string;
  vignette: string;
  text: string;
  textSecondary: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentPressed: string;
  accentMuted: string;
  accentGlow: string;
  textOnAccent: string;
  info: string;
  pttIdleFill: string;
  pttRingIdle: string;
  waveformIdle: string;
  waveformActive: string;
  waveformTrack: string;
  captionFill: string;
  captionBorder: string;
};

const LIGHT: ChromeColors = {
  bgApp: "#F4F7FB",
  bgElevated: "#FFFFFF",
  bgMuted: "#E8EEF6",
  bgOverlay: "rgba(15, 23, 42, 0.45)",
  border: "#D5DEEA",
  borderStrong: "#B6C3D6",
  borderFocus: "#007A88",
  glassFill: "rgba(255, 255, 255, 0.72)",
  glassBorder: "rgba(15, 23, 42, 0.08)",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  textOnAccent: "#F0FDFA",
  textOnDanger: "#FEF2F2",
  accent: "#007A88",
  accentPressed: "#006B78",
  accentMuted: "rgba(0, 122, 136, 0.14)",
  accentGlow: "rgba(0, 122, 136, 0.28)",
  accentInk: "#007A88",
  personaTintInterviewer: "#007A88",
  personaTintBuddy: "#7C3AED",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  dangerInk: "#B91C1C",
  dangerWash: "rgba(220, 38, 38, 0.10)",
  dangerBorder: "rgba(185, 28, 28, 0.35)",
  info: "#38BDF8",
  infoInk: "#0369A1",
  infoWash: "rgba(2, 132, 199, 0.10)",
  infoBorder: "rgba(3, 105, 161, 0.35)",
  neutralStatus: "#64748B",
  waveformIdle: "#B6C3D6",
  waveformActive: "#007A88",
  waveformTrack: "#E8EEF6",
};

const DARK: ChromeColors = {
  bgApp: "#040d1a",
  bgElevated: "#0a1628",
  bgMuted: "#0e1f38",
  bgOverlay: "rgba(4, 13, 26, 0.72)",
  border: "#12233A",
  borderStrong: "#1C3352",
  borderFocus: "#00e5ff",
  glassFill: "rgba(255, 255, 255, 0.06)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  text: "#E8F4F8",
  textSecondary: "#A8B3C7",
  textMuted: "#6B7A94",
  textOnAccent: "#042F2E",
  textOnDanger: "#FEF2F2",
  accent: "#00e5ff",
  accentPressed: "#00C4DC",
  accentMuted: "rgba(0, 229, 255, 0.16)",
  accentGlow: "rgba(0, 229, 255, 0.35)",
  accentInk: "#00e5ff",
  personaTintInterviewer: "#00e5ff",
  personaTintBuddy: "#8b5cf6",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  dangerInk: "#F87171",
  dangerWash: "rgba(248, 113, 113, 0.14)",
  dangerBorder: "rgba(248, 113, 113, 0.4)",
  info: "#38BDF8",
  infoInk: "#38BDF8",
  infoWash: "rgba(56, 189, 248, 0.14)",
  infoBorder: "rgba(56, 189, 248, 0.35)",
  neutralStatus: "#94A3B8",
  waveformIdle: "#1C3352",
  waveformActive: "#00e5ff",
  waveformTrack: "#0e1f38",
};

/** Session / avatar stage — always force_dark (theme-stable). */
export const stageColors: StageColors = {
  bg: "#040d1a",
  elevated: "#0a1628",
  vignette: "rgba(0, 0, 0, 0.45)",
  text: "#E8F4F8",
  textSecondary: "#A8B3C7",
  border: "#12233A",
  borderStrong: "#1C3352",
  accent: "#00e5ff",
  accentPressed: "#00C4DC",
  accentMuted: "rgba(0, 229, 255, 0.16)",
  accentGlow: "rgba(0, 229, 255, 0.35)",
  textOnAccent: "#042F2E",
  info: "#38BDF8",
  pttIdleFill: "#0a1628",
  pttRingIdle: "#1C3352",
  waveformIdle: "#1C3352",
  waveformActive: "#00e5ff",
  waveformTrack: "#0e1f38",
  captionFill: "rgba(0, 0, 0, 0.35)",
  captionBorder: "rgba(255, 255, 255, 0.07)",
};

export function chromeColors(scheme: ResolvedColorScheme): ChromeColors {
  return scheme === "light" ? LIGHT : DARK;
}

/** Non-CTA persona tint hairline / ambient wash (never primary button fill). */
export function personaTint(
  scheme: ResolvedColorScheme,
  slug: "tough-interviewer" | "native-buddy",
): string {
  const colors = chromeColors(scheme);
  return slug === "tough-interviewer"
    ? colors.personaTintInterviewer
    : colors.personaTintBuddy;
}
