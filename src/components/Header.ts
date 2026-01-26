import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import { COLORS } from "../theme";
import { LOADING_CHARS } from "../utils";
import type { UpdateInfo } from "../version";
import { getUpdateCommand } from "../version";

export interface HeaderCallbacks {
  onOpenGitHub?: () => void;
}

export interface HeaderState {
  loadingIndicator: TextRenderable;
  loadingInterval: ReturnType<typeof setInterval> | null;
  loadingFrame: number;
  rightContainer: BoxRenderable;
  githubLink: TextRenderable;
  updateContainer: BoxRenderable;
  updateLabel: TextRenderable;
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

  // Delta icon
  const icon = new TextRenderable(ctx, {
    content: "\u2206",
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

  // Right side container with loading indicator + (GitHub link OR update notification)
  const rightContainer = new BoxRenderable(ctx, {
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
  });

  // Loading indicator (hidden initially by being empty)
  const loadingIndicator = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.textDim,
  });
  rightContainer.add(loadingIndicator);

  // GitHub link (shown by default)
  const githubLink = new TextRenderable(ctx, {
    content: "brianlovin/hn-cli",
    fg: COLORS.textDim,
    onMouseDown: () => {
      callbacks.onOpenGitHub?.();
    },
    onMouseOver: () => {
      (githubLink as any).fg = COLORS.link;
    },
    onMouseOut: () => {
      (githubLink as any).fg = COLORS.textDim;
    },
  });
  rightContainer.add(githubLink);

  // Update notification container (hidden initially, replaces GitHub link when update available)
  const updateContainer = new BoxRenderable(ctx, {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  });

  const updateLabel = new TextRenderable(ctx, {
    content: "update available",
    fg: COLORS.success,
  });

  const updateCommand = new TextRenderable(ctx, {
    content: "",
    fg: COLORS.textDim,
  });

  updateContainer.add(updateLabel);
  updateContainer.add(updateCommand);
  // Note: updateContainer is NOT added to rightContainer initially

  header.add(rightContainer);

  const state: HeaderState = {
    loadingIndicator,
    loadingInterval: null,
    loadingFrame: 0,
    rightContainer,
    githubLink,
    updateContainer,
    updateLabel,
    updateCommand,
  };

  return { header, state };
}

export function showUpdateNotification(
  state: HeaderState,
  updateInfo: UpdateInfo | null,
): void {
  if (updateInfo?.hasUpdate) {
    // Hide GitHub link and show update notification
    state.rightContainer.remove(state.githubLink.id);
    state.updateCommand.content = getUpdateCommand();
    // Only add if not already present
    const children = state.rightContainer.getChildren();
    const hasUpdateContainer = children.some(child => child.id === state.updateContainer.id);
    if (!hasUpdateContainer) {
      state.rightContainer.add(state.updateContainer);
    }
  } else {
    // Hide update notification and show GitHub link
    state.rightContainer.remove(state.updateContainer.id);
    // Only add if not already present
    const children = state.rightContainer.getChildren();
    const hasGithubLink = children.some(child => child.id === state.githubLink.id);
    if (!hasGithubLink) {
      state.rightContainer.add(state.githubLink);
    }
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
