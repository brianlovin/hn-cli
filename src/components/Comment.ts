import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import type { HackerNewsComment } from "../types";
import { COLORS, getCommentBorderColor } from "../theme";
import { stripHtml } from "../utils";

export function renderComment(
  ctx: RenderContext,
  comment: HackerNewsComment,
): BoxRenderable {
  const isRootComment = comment.level === 0;
  const borderColor = getCommentBorderColor(comment.level);

  // Use a wrapper for indentation to properly constrain width
  const wrapper = new BoxRenderable(ctx, {
    id: `comment-wrapper-${comment.id}`,
    width: "100%",
    marginTop: 1,
    flexDirection: "row",
  });

  // Indent spacer (if nested)
  if (comment.level > 0) {
    const spacer = new BoxRenderable(ctx, {
      width: comment.level * 2,
      flexShrink: 0,
    });
    wrapper.add(spacer);
  }

  // Actual comment container with border
  const container = new BoxRenderable(ctx, {
    id: `comment-${comment.id}`,
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 1,
    paddingRight: 1,
    borderStyle: "single",
    border: ["left"],
    borderColor: borderColor,
    flexDirection: "column",
  });

  // Author - root comments get orange accent color
  const authorText = new TextRenderable(ctx, {
    content: comment.user || "[deleted]",
    fg: isRootComment ? COLORS.accent : COLORS.textDim,
  });
  container.add(authorText);

  // Content - use word wrapping for proper text flow
  if (comment.content) {
    const contentText = new TextRenderable(ctx, {
      content: stripHtml(comment.content),
      fg: COLORS.text,
      wrapMode: "word",
    });
    container.add(contentText);
  } else if (comment.deleted) {
    const deletedText = new TextRenderable(ctx, {
      content: "[deleted]",
      fg: COLORS.textMuted,
    });
    container.add(deletedText);
  }

  wrapper.add(container);

  // Nested comments go in the wrapper to maintain proper indentation chain
  if (comment.comments && comment.comments.length > 0) {
    const nestedContainer = new BoxRenderable(ctx, {
      width: "100%",
      flexDirection: "column",
    });

    for (const child of comment.comments) {
      const childComment = renderComment(ctx, child);
      nestedContainer.add(childComment);
    }

    // Add nested comments after the wrapper
    const outerWrapper = new BoxRenderable(ctx, {
      width: "100%",
      flexDirection: "column",
    });
    outerWrapper.add(wrapper);
    outerWrapper.add(nestedContainer);
    return outerWrapper;
  }

  return wrapper;
}
