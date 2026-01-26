import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { COLORS } from "../theme";

// Progress bar configuration
const BAR_WIDTH = 30; // Inner width (not counting brackets)
const BLOCK_FULL = "\u2588"; // Full block █
const BLOCK_EMPTY = "\u2591"; // Light shade ░
const FILLED_MAX_WIDTH = 6; // Max filled blocks when not squished

// Generate bouncing progress bar with squish effect at edges
function generateLoadingBar(frame: number): string {
  // Center position bounces back and forth
  const cycle = (BAR_WIDTH - 1) * 2;
  const pos = frame % cycle;
  const centerPos = pos < BAR_WIDTH ? pos : cycle - pos;

  // Calculate filled region - squishes at edges due to clamping
  const halfWidth = Math.floor(FILLED_MAX_WIDTH / 2);
  let start = centerPos - halfWidth;
  let end = centerPos + halfWidth + (FILLED_MAX_WIDTH % 2);

  // Clamp to boundaries (creates squish effect)
  start = Math.max(0, start);
  end = Math.min(BAR_WIDTH, end);

  // Build the bar (no brackets, just the blocks)
  let bar = "";
  for (let i = 0; i < BAR_WIDTH; i++) {
    bar += i >= start && i < end ? BLOCK_FULL : BLOCK_EMPTY;
  }
  return bar;
}

export type EmptyStateMode = "loading" | "idle";

export interface EmptyStateState {
  container: BoxRenderable;
  progressBar: TextRenderable;
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

  // Single progress bar centered on screen
  const progressBar = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.textSecondary,
  });

  const statusText = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.textSecondary,
    marginTop: 2,
  });

  container.add(progressBar);
  container.add(statusText);

  return {
    container,
    progressBar,
    statusText,
    mode: "loading",
    frame: 0,
    animationInterval: null,
  };
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

  if (mode === "loading") {
    // Show progress bar, no status text
    state.progressBar.content = generateLoadingBar(0);
    state.statusText.content = "";

    state.animationInterval = setInterval(() => {
      if (isDestroyed()) {
        stopEmptyStateAnimation(state);
        return;
      }

      state.frame++;
      state.progressBar.content = generateLoadingBar(state.frame);
    }, 40); // Smooth animation
  } else {
    // Idle mode: no progress bar, show hint
    state.progressBar.content = "";
    state.statusText.content = "Press j/k to browse stories";
  }
}

export function stopEmptyStateAnimation(state: EmptyStateState): void {
  if (state.animationInterval) {
    clearInterval(state.animationInterval);
    state.animationInterval = null;
  }
}
