import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import type { HackerNewsPost } from "../types";
import { COLORS } from "../theme";

export interface StoryHeaderCallbacks {
  onOpenStoryUrl: () => void;
}

export interface StoryHeaderState {
  container: BoxRenderable;
}

export function createStoryHeader(
  ctx: RenderContext,
  post: HackerNewsPost,
  callbacks: StoryHeaderCallbacks,
): StoryHeaderState {
  const container = new BoxRenderable(ctx, {
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    paddingLeft: 2,
    paddingRight: 2,
    paddingTop: 1,
    paddingBottom: 1,
    borderStyle: "single",
    border: ["bottom"],
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  });

  // Title
  const titleText = new TextRenderable(ctx, {
    content: post.title,
    fg: COLORS.text,
    wrapMode: "word",
    flexShrink: 0,
    maxHeight: 2,
    onMouseDown: () => callbacks.onOpenStoryUrl(),
    onMouseOver: () => {
      (titleText as any).fg = COLORS.link;
    },
    onMouseOut: () => {
      (titleText as any).fg = COLORS.text;
    },
  });
  container.add(titleText);

  // Domain
  if (post.domain) {
    const domainText = new TextRenderable(ctx, {
      content: post.domain,
      fg: COLORS.textDim,
      flexShrink: 0,
      maxHeight: 1,
      onMouseDown: () => callbacks.onOpenStoryUrl(),
    });
    container.add(domainText);
  }

  return { container };
}

export function renderStoryHeader(
  ctx: RenderContext,
  container: BoxRenderable,
  post: HackerNewsPost,
  callbacks: StoryHeaderCallbacks,
): void {
  // Clear existing content
  for (const child of container.getChildren()) {
    container.remove(child.id);
  }

  // Title
  const titleText = new TextRenderable(ctx, {
    content: post.title,
    fg: COLORS.text,
    wrapMode: "word",
    flexShrink: 0,
    maxHeight: 2,
    onMouseDown: () => callbacks.onOpenStoryUrl(),
    onMouseOver: () => {
      (titleText as any).fg = COLORS.link;
    },
    onMouseOut: () => {
      (titleText as any).fg = COLORS.text;
    },
  });
  container.add(titleText);

  // Domain
  if (post.domain) {
    const domainText = new TextRenderable(ctx, {
      content: post.domain,
      fg: COLORS.textDim,
      flexShrink: 0,
      maxHeight: 1,
      onMouseDown: () => callbacks.onOpenStoryUrl(),
    });
    container.add(domainText);
  }
}
