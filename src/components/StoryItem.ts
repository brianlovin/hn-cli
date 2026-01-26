import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import type { HackerNewsPost } from "../types";
import { COLORS } from "../theme";
import { truncateText } from "../utils";

const MAX_TITLE_LENGTH = 80;

export interface StoryItemCallbacks {
  onSelect: (index: number) => void;
}

export function createStoryItem(
  ctx: RenderContext,
  post: HackerNewsPost,
  index: number,
  isSelected: boolean,
  callbacks: StoryItemCallbacks,
): BoxRenderable {
  const item = new BoxRenderable(ctx, {
    id: `story-${post.id}`,
    width: "100%",
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: COLORS.bg,
    flexDirection: "row",
    onMouseDown: () => {
      callbacks.onSelect(index);
    },
  });

  // Chevron indicator column
  const chevronIndicator = new TextRenderable(ctx, {
    id: `chevron-${post.id}`,
    content: isSelected ? "\u203A" : "\u2022",
    fg: isSelected ? COLORS.accent : COLORS.textTertiary,
    width: 2,
    paddingLeft: 1,
  });
  item.add(chevronIndicator);

  // Content area
  const content = new BoxRenderable(ctx, {
    id: `content-${post.id}`,
    flexGrow: 1,
    flexDirection: "column",
    paddingRight: 2,
  });
  item.add(content);

  // Title (truncated to ~2 lines worth of characters)
  const titleText = new TextRenderable(ctx, {
    id: `title-${post.id}`,
    content: truncateText(post.title, MAX_TITLE_LENGTH),
    fg: isSelected ? COLORS.accent : COLORS.textPrimary,
    maxHeight: 2,
  });
  content.add(titleText);

  // Domain on separate line (lighter gray)
  if (post.domain) {
    const domainText = new TextRenderable(ctx, {
      id: `domain-${post.id}`,
      content: post.domain,
      fg: COLORS.textSecondary,
    });
    content.add(domainText);
  }

  return item;
}

export function updateStoryItemStyle(
  item: BoxRenderable,
  post: HackerNewsPost,
  isSelected: boolean,
): void {
  const children = item.getChildren();
  // children[0] = chevron indicator, children[1] = content box
  if (children.length >= 2) {
    // Update chevron indicator
    const chevronIndicator = children[0] as TextRenderable;
    if (chevronIndicator && "content" in chevronIndicator) {
      chevronIndicator.content = isSelected ? "\u203A" : "\u2022";
      (chevronIndicator as any).fg = isSelected
        ? COLORS.accent
        : COLORS.textTertiary;
    }

    // Update title color (inside content box)
    const contentBox = children[1] as BoxRenderable;
    const contentChildren = contentBox.getChildren();
    if (contentChildren.length > 0) {
      const titleText = contentChildren[0] as TextRenderable;
      if (titleText && "content" in titleText) {
        (titleText as any).fg = isSelected ? COLORS.accent : COLORS.textPrimary;
      }
    }
  }
}

export function updateStoryChevron(
  item: BoxRenderable,
  character: string,
): void {
  const children = item.getChildren();
  if (children.length >= 1) {
    const chevronIndicator = children[0] as TextRenderable;
    if (chevronIndicator && "content" in chevronIndicator) {
      chevronIndicator.content = character;
    }
  }
}
