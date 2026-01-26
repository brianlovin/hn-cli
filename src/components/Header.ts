import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import { COLORS } from "../theme";
import { LOADING_CHARS } from "../utils";
import type { UpdateInfo } from "../version";
import { getUpdateCommand, currentVersion } from "../version";

export interface HeaderCallbacks {
  // Currently unused, reserved for future header interactions
}

export interface HeaderState {
  loadingIndicator: TextRenderable;
  loadingInterval: ReturnType<typeof setInterval> | null;
  loadingFrame: number;
  rightContainer: BoxRenderable;
  versionLabel: TextRenderable;
  updateContainer: BoxRenderable;
  updateArrow: TextRenderable;
  latestVersionLabel: TextRenderable;
  updateCommand: TextRenderable;
}

export function createHeader(
  ctx: RenderContext,
  callbacks: HeaderCallbacks,
): { header: BoxRenderable; state: HeaderState } {
  const header = new BoxRenderable(ctx, {
    width: "100%",
    height: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 1,
    paddingRight: 2,
    backgroundColor: COLORS.bg,
    borderStyle: "single",
    border: ["bottom"],
    borderColor: COLORS.border,
  });

  // Left side container with icon + title
  const leftContainer = new BoxRenderable(ctx, {
    flexDirection: "row",
    alignItems: "center",
  });

  // Logo icon
  const icon = new TextRenderable(ctx, {
    content: "■",
    fg: COLORS.accent,
    width: 2,
    paddingLeft: 1,
  });
  leftContainer.add(icon);

  const title = new TextRenderable(ctx, {
    content: "Hacker News",
    fg: COLORS.accent,
  });
  leftContainer.add(title);

  header.add(leftContainer);

  // Right side container with loading indicator + version + update notification
  const rightContainer = new BoxRenderable(ctx, {
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
  });

  // Loading indicator (hidden initially by being empty)
  const loadingIndicator = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.textSecondary,
  });
  rightContainer.add(loadingIndicator);

  // Version label (shown by default)
  const versionLabel = new TextRenderable(ctx, {
    content: `v${currentVersion}`,
    fg: COLORS.textSecondary,
  });
  rightContainer.add(versionLabel);

  // Update notification container (hidden initially, shown when update available)
  // Shows: "v0.3.0 → v0.4.0  bun install -g ..."
  const updateContainer = new BoxRenderable(ctx, {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  });

  const updateArrow = new TextRenderable(ctx, {
    content: "→",
    fg: COLORS.textSecondary,
  });

  const latestVersionLabel = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.success,
  });

  const updateCommand = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.textSecondary,
  });

  updateContainer.add(updateArrow);
  updateContainer.add(latestVersionLabel);
  updateContainer.add(updateCommand);
  // Note: updateContainer is NOT added to rightContainer initially

  header.add(rightContainer);

  const state: HeaderState = {
    loadingIndicator,
    loadingInterval: null,
    loadingFrame: 0,
    rightContainer,
    versionLabel,
    updateContainer,
    updateArrow,
    latestVersionLabel,
    updateCommand,
  };

  return { header, state };
}

export function showUpdateNotification(
  state: HeaderState,
  updateInfo: UpdateInfo | null,
): void {
  if (updateInfo?.hasUpdate) {
    // Show update notification: "v0.3.0 → v0.4.0  bun install -g ..."
    state.latestVersionLabel.content = `v${updateInfo.latestVersion}`;
    state.updateCommand.content = getUpdateCommand();
    // Only add if not already present
    const children = state.rightContainer.getChildren();
    const hasUpdateContainer = children.some(child => child.id === state.updateContainer.id);
    if (!hasUpdateContainer) {
      state.rightContainer.add(state.updateContainer);
    }
  } else {
    // Hide update notification (version label stays visible)
    state.rightContainer.remove(state.updateContainer.id);
  }
}

export function startLoadingAnimation(
  state: HeaderState,
  isDestroyed: () => boolean,
): void {
  if (state.loadingInterval) return;

  state.loadingFrame = 0;
  state.loadingInterval = setInterval(() => {
    if (state.loadingIndicator && !isDestroyed()) {
      const char = LOADING_CHARS[state.loadingFrame] ?? "\u280B";
      state.loadingIndicator.content = char;
      state.loadingFrame = (state.loadingFrame + 1) % LOADING_CHARS.length;
    }
  }, 80);
}

export function stopLoadingAnimation(state: HeaderState): void {
  if (state.loadingInterval) {
    clearInterval(state.loadingInterval);
    state.loadingInterval = null;
  }
  if (state.loadingIndicator) {
    state.loadingIndicator.content = "";
  }
}
