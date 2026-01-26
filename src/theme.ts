import type { CliRenderer } from "@opentui/core";

export interface Theme {
  bg: string | undefined;
  bgSelected: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  link: string;
  success: string;
  error: string;
  hint: string;
  commentL1: string;
  commentL2: string;
  commentL3: string;
}

const DARK_THEME: Theme = {
  bg: undefined, // Use terminal default
  bgSelected: "#2a2a2a",
  border: "#3a3a3a",
  textPrimary: "#e0e0e0",
  textSecondary: "#888888",
  textTertiary: "#666666",
  accent: "#ff6600",
  link: "#6699ff",
  success: "#4ade80",
  error: "#ef4444",
  hint: "#a855f7",
  commentL1: "#555555",
  commentL2: "#444444",
  commentL3: "#333333",
};

const LIGHT_THEME: Theme = {
  bg: undefined, // Use terminal default
  bgSelected: "#e8e8e8",
  border: "#cccccc",
  textPrimary: "#1a1a1a",
  textSecondary: "#666666",
  textTertiary: "#888888",
  accent: "#ff6600",
  link: "#0066cc",
  success: "#22c55e",
  error: "#dc2626",
  hint: "#9333ea",
  commentL1: "#cccccc",
  commentL2: "#dddddd",
  commentL3: "#eeeeee",
};

// Current theme colors - mutated in place by detectTheme()
export const COLORS: Theme = { ...DARK_THEME };

function isLightBackground(hexColor: string | null): boolean {
  if (!hexColor) return false;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export async function detectTheme(renderer: CliRenderer): Promise<void> {
  try {
    const palette = await renderer.getPalette({ timeout: 100 });
    if (
      palette.defaultBackground &&
      isLightBackground(palette.defaultBackground)
    ) {
      Object.assign(COLORS, LIGHT_THEME);
    }
  } catch {
    // If detection fails, keep dark theme (default)
  }
}

export function getCommentBorderColor(level: number): string {
  const borderColors: Record<number, string> = {
    0: COLORS.accent, // Root comments always orange
    1: COLORS.commentL1,
    2: COLORS.commentL2,
    3: COLORS.commentL3,
  };
  return borderColors[level] ?? COLORS.commentL3;
}
