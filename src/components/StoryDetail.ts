import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type RenderContext,
} from "@opentui/core";
import type { HackerNewsPost } from "../types";
import { COLORS } from "../theme";
import { stripHtml } from "../utils";
import { renderComment } from "./Comment";
import { createShortcutsBar, MAIN_SHORTCUTS } from "./ShortcutsBar";
import { renderStoryHeader } from "./StoryHeader";
import type { UpdateInfo } from "../version";
import { getUpdateCommand } from "../version";

export interface StoryDetailCallbacks {
  onOpenStoryUrl: () => void;
}

export interface StoryDetailState {
  panel: BoxRenderable;
  header: BoxRenderable;
  scroll: ScrollBoxRenderable;
  content: BoxRenderable;
  shortcutsBar: BoxRenderable;
  rootCommentBoxes: BoxRenderable[];
}

export function createStoryDetail(
  ctx: RenderContext,
  callbacks: StoryDetailCallbacks,
): StoryDetailState {
  const panel = new BoxRenderable(ctx, {
    width: 0, // Base width of 0 combined with flexGrow forces proper text wrapping
    flexGrow: 1, // Fill remaining width after story list
    flexShrink: 0, // Prevent shrinking when content is loading
    height: "100%",
    flexDirection: "column",
    backgroundColor: COLORS.bg,
  });

  // Detail header (stays fixed, outside scroll)
  const header = new BoxRenderable(ctx, {
    id: "detail-header",
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

  const scroll = new ScrollBoxRenderable(ctx, {
    width: "100%",
    flexGrow: 1,
    scrollY: true,
    backgroundColor: COLORS.bg,
    contentOptions: {
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      backgroundColor: COLORS.bg,
    },
  });

  const content = new BoxRenderable(ctx, {
    width: "100%",
    flexDirection: "column",
    backgroundColor: COLORS.bg,
  });

  scroll.add(content);
  // Note: header, scroll, and shortcuts are NOT added to panel initially
  // They are added dynamically when a story is selected (see showDetailComponents)

  // Keyboard shortcuts bar at bottom
  const shortcutsBar = createShortcutsBar(ctx, MAIN_SHORTCUTS);

  return {
    panel,
    header,
    scroll,
    content,
    shortcutsBar,
    rootCommentBoxes: [],
  };
}

export function showShortcutsBar(state: StoryDetailState): void {
  // Only add if not already present
  const children = state.panel.getChildren();
  const hasShortcutsBar = children.some(child => child.id === state.shortcutsBar.id);
  if (!hasShortcutsBar) {
    state.panel.add(state.shortcutsBar);
  }
}

export function hideShortcutsBar(state: StoryDetailState): void {
  state.panel.remove(state.shortcutsBar.id);
}

export function showDetailComponents(state: StoryDetailState): void {
  // Add header, scroll, and shortcuts in order
  const children = state.panel.getChildren();
  const hasHeader = children.some(child => child.id === state.header.id);
  if (!hasHeader) {
    state.panel.add(state.header);
    state.panel.add(state.scroll);
    state.panel.add(state.shortcutsBar);
  }
}

export function hideDetailComponents(state: StoryDetailState): void {
  state.panel.remove(state.header.id);
  state.panel.remove(state.scroll.id);
  state.panel.remove(state.shortcutsBar.id);
}

export function renderStoryDetail(
  ctx: RenderContext,
  state: StoryDetailState,
  post: HackerNewsPost,
  callbacks: StoryDetailCallbacks,
): void {
  // Clear existing scroll content
  for (const child of state.content.getChildren()) {
    state.content.remove(child.id);
  }
  state.rootCommentBoxes = [];

  // Render header with title and domain
  renderStoryHeader(ctx, state.header, post, callbacks);

  // Post content if exists
  if (post.content) {
    const contentBox = new BoxRenderable(ctx, {
      width: "100%",
      marginBottom: 1,
    });
    const contentText = new TextRenderable(ctx, {
      content: stripHtml(post.content),
      fg: COLORS.textPrimary,
      wrapMode: "word",
    });
    contentBox.add(contentText);
    state.content.add(contentBox);
  }

  // Comments section
  const commentsSection = new BoxRenderable(ctx, {
    width: "100%",
    flexDirection: "column",
  });

  // Comments header with count
  const commentsHeader = new TextRenderable(ctx, {
    content: `${post.comments_count} comments`,
    fg: COLORS.textSecondary,
  });
  commentsSection.add(commentsHeader);

  // Comments
  if (post.comments && post.comments.length > 0) {
    for (let idx = 0; idx < post.comments.length; idx++) {
      const comment = post.comments[idx];
      if (!comment) continue;
      const commentBox = renderComment(ctx, comment);
      commentsSection.add(commentBox);
      // Track root comment boxes for navigation
      if (comment.level === 0) {
        state.rootCommentBoxes.push(commentBox);
      }
    }
  } else {
    const noComments = new TextRenderable(ctx, {
      content: "No comments yet...",
      fg: COLORS.textSecondary,
    });
    commentsSection.add(noComments);
  }

  state.content.add(commentsSection);

  // Reset scroll position
  state.scroll.scrollTop = 0;
}

export function renderEmptyDetail(
  ctx: RenderContext,
  state: StoryDetailState,
  updateInfo: UpdateInfo | null,
): void {
  // Clear existing header content
  for (const child of state.header.getChildren()) {
    state.header.remove(child.id);
  }

  // Clear existing scroll content
  for (const child of state.content.getChildren()) {
    state.content.remove(child.id);
  }

  // Show empty state message in header
  const emptyMessage = new TextRenderable(ctx, {
    content: "Select a story to view details",
    fg: COLORS.textSecondary,
  });
  state.header.add(emptyMessage);

  // Show update notification if available
  if (updateInfo?.hasUpdate) {
    const updateContainer = new BoxRenderable(ctx, {
      width: "100%",
      flexDirection: "column",
      paddingTop: 2,
    });

    const updateMessage = new TextRenderable(ctx, {
      content: `Update available: v${updateInfo.currentVersion} \u2192 v${updateInfo.latestVersion}`,
      fg: COLORS.accent,
    });
    updateContainer.add(updateMessage);

    const updateCommand = new TextRenderable(ctx, {
      content: getUpdateCommand(),
      fg: COLORS.textSecondary,
    });
    updateContainer.add(updateCommand);

    state.content.add(updateContainer);
  }
}

export function scrollToRootComment(
  state: StoryDetailState,
  index: number,
): void {
  if (index < 0 || index >= state.rootCommentBoxes.length) return;

  const targetComment = state.rootCommentBoxes[index];
  if (!targetComment) return;

  // The comment box's y property is its absolute screen position.
  // To get its position within the scroll content, subtract the scroll content's y position.
  const scrollContent = state.scroll.content;
  const relativeY = targetComment.y - scrollContent.y;

  // Scroll so the comment is near the top of the viewport
  state.scroll.scrollTop = Math.max(0, relativeY - 1);
}
