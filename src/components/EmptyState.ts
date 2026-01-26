import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { COLORS } from "../theme";

// Character density map from sparse to dense
const DENSITY_CHARS = " .,:;-~=+*#%@";

// Wave animation configuration
const WAVE_WIDTH = 40;
const WAVE_HEIGHT = 12;

// Grayscale color palette from dark to light
const GRAY_COLORS = [
  "#2a2a2a", // very dark
  "#3a3a3a",
  "#4a4a4a",
  "#5a5a5a",
  "#6a6a6a",
  "#7a7a7a",
  "#8a8a8a",
  "#9a9a9a",
  "#aaaaaa",
  "#bbbbbb",
  "#cccccc", // light
];

// Generate wave intensity at a point
function waveIntensity(x: number, y: number, t: number): number {
  const nx = x / WAVE_WIDTH;
  const ny = y / WAVE_HEIGHT;

  // Multiple wave layers with different frequencies and directions
  const wave1 = Math.sin(nx * 8 + t * 1.2) * Math.cos(ny * 4 - t * 0.8);
  const wave2 = Math.sin(nx * 5 - t * 0.9 + ny * 3) * 0.7;
  const wave3 = Math.cos(nx * 12 + ny * 6 + t * 1.5) * 0.4;
  const wave4 = Math.sin((nx + ny) * 6 - t * 1.1) * 0.5;

  // Combine waves
  let intensity = (wave1 + wave2 + wave3 + wave4) / 2.6;

  // Soft edge falloff
  const edgeX = Math.min(nx, 1 - nx) * 4;
  const edgeY = Math.min(ny, 1 - ny) * 3;
  const edge = Math.min(1, Math.min(edgeX, edgeY));

  intensity = (intensity * 0.5 + 0.5) * edge;

  return Math.max(0, Math.min(1, intensity));
}

// Generate a single frame of the wave animation
function generateWaveFrame(time: number): { lines: string[]; colors: string[] } {
  const lines: string[] = [];
  const colors: string[] = [];

  for (let y = 0; y < WAVE_HEIGHT; y++) {
    let line = "";
    let rowIntensitySum = 0;

    for (let x = 0; x < WAVE_WIDTH; x++) {
      const intensity = waveIntensity(x, y, time);
      rowIntensitySum += intensity;

      // Map to character density
      const charIndex = Math.min(
        DENSITY_CHARS.length - 1,
        Math.max(0, Math.floor(intensity * DENSITY_CHARS.length))
      );
      line += DENSITY_CHARS[charIndex];
    }

    lines.push(line);

    // Average intensity for row color
    const avgIntensity = rowIntensitySum / WAVE_WIDTH;
    const colorIndex = Math.min(
      GRAY_COLORS.length - 1,
      Math.max(0, Math.floor(avgIntensity * GRAY_COLORS.length))
    );
    colors.push(GRAY_COLORS[colorIndex]!);
  }

  return { lines, colors };
}

// Loading animation - faster, more energetic waves
function generateLoadingWaveFrame(time: number): { lines: string[]; colors: string[] } {
  const lines: string[] = [];
  const colors: string[] = [];
  const pulse = Math.sin(time * 4) * 0.2 + 0.8;

  for (let y = 0; y < WAVE_HEIGHT; y++) {
    let line = "";
    let rowIntensitySum = 0;

    for (let x = 0; x < WAVE_WIDTH; x++) {
      // Faster wave movement for loading
      let intensity = waveIntensity(x, y, time * 2);
      intensity *= pulse;
      rowIntensitySum += intensity;

      const charIndex = Math.min(
        DENSITY_CHARS.length - 1,
        Math.max(0, Math.floor(intensity * DENSITY_CHARS.length))
      );
      line += DENSITY_CHARS[charIndex];
    }

    lines.push(line);

    const avgIntensity = rowIntensitySum / WAVE_WIDTH;
    const colorIndex = Math.min(
      GRAY_COLORS.length - 1,
      Math.max(0, Math.floor(avgIntensity * GRAY_COLORS.length))
    );
    colors.push(GRAY_COLORS[colorIndex]!);
  }

  return { lines, colors };
}

export type EmptyStateMode = "loading" | "idle";

export interface EmptyStateState {
  container: BoxRenderable;
  waveContainer: BoxRenderable;
  waveRows: TextRenderable[];
  statusText: TextRenderable;
  mode: EmptyStateMode;
  frame: number;
  animationInterval: ReturnType<typeof setInterval> | null;
}

export function createEmptyState(ctx: RenderContext): EmptyStateState {
  const container = new BoxRenderable(ctx, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  });

  // Container for wave rows
  const waveContainer = new BoxRenderable(ctx, {
    flexDirection: "column",
    alignItems: "center",
  });

  // Create individual text rows for per-row coloring
  const waveRows: TextRenderable[] = [];
  for (let i = 0; i < WAVE_HEIGHT; i++) {
    const row = new TextRenderable(ctx, {
      content: " ".repeat(WAVE_WIDTH),
      fg: GRAY_COLORS[5],
    });
    waveRows.push(row);
    waveContainer.add(row);
  }

  const statusText = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.textDim,
    marginTop: 2,
  });

  container.add(waveContainer);
  container.add(statusText);

  return {
    container,
    waveContainer,
    waveRows,
    statusText,
    mode: "loading",
    frame: 0,
    animationInterval: null,
  };
}

// TextRenderable with mutable fg property (the property exists but isn't typed as mutable)
type MutableTextRenderable = TextRenderable & { fg: string };

function updateWaveDisplay(state: EmptyStateState, time: number): void {
  const generateFrame = state.mode === "loading" ? generateLoadingWaveFrame : generateWaveFrame;
  const { lines, colors } = generateFrame(time);

  for (let i = 0; i < state.waveRows.length && i < lines.length; i++) {
    const row = state.waveRows[i] as MutableTextRenderable;
    row.content = lines[i]!;
    row.fg = colors[i]!;
  }
}

export function startEmptyStateAnimation(
  state: EmptyStateState,
  mode: EmptyStateMode,
  isDestroyed: () => boolean,
): void {
  // Stop any existing animation
  stopEmptyStateAnimation(state);

  state.mode = mode;
  state.frame = 0;

  const interval = mode === "loading" ? 50 : 80; // Faster for smoother animation

  // Set initial frame
  updateWaveDisplay(state, 0);
  state.statusText.content = mode === "loading"
    ? "Fetching stories..."
    : "Press j/k to browse stories";

  state.animationInterval = setInterval(() => {
    if (isDestroyed()) {
      stopEmptyStateAnimation(state);
      return;
    }

    state.frame++;
    const time = state.frame * 0.1; // Convert frame to time
    updateWaveDisplay(state, time);
  }, interval);
}

export function stopEmptyStateAnimation(state: EmptyStateState): void {
  if (state.animationInterval) {
    clearInterval(state.animationInterval);
    state.animationInterval = null;
  }
}
