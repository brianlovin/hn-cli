import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import { COLORS } from "../theme";
import { LOADING_CHARS } from "../utils";

export interface HeaderCallbacks {
  onOpenGitHub?: () => void;
}

export interface HeaderState {
  loadingIndicator: TextRenderable;
  loadingInterval: ReturnType<typeof setInterval> | null;
  loadingFrame: number;
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

  // Right side container with loading indicator + GitHub link
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

  // GitHub link
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

  header.add(rightContainer);

  const state: HeaderState = {
    loadingIndicator,
    loadingInterval: null,
    loadingFrame: 0,
  };

  return { header, state };
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
