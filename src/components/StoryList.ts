import {
  BoxRenderable,
  ScrollBoxRenderable,
  type RenderContext,
} from "@opentui/core";
import type { HackerNewsPost } from "../types";
import { COLORS } from "../theme";
import {
  createStoryItem,
  updateStoryItemStyle,
  type StoryItemCallbacks,
} from "./StoryItem";

export interface StoryListState {
  panel: BoxRenderable;
  scroll: ScrollBoxRenderable;
  items: Map<number, BoxRenderable>;
}

export function createStoryList(ctx: RenderContext): StoryListState {
  const panel = new BoxRenderable(ctx, {
    id: "story-list-panel",
    width: "35%",
    maxWidth: 60, // Cap at ~60 characters for wide terminals
    flexShrink: 0, // Prevent shrinking during layout transitions
    height: "100%",
    flexDirection: "column",
    borderStyle: "single",
    border: ["right"],
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingLeft: 1,
  });

  const scroll = new ScrollBoxRenderable(ctx, {
    width: "100%",
    flexGrow: 1,
    scrollY: true,
    backgroundColor: COLORS.bg,
    contentOptions: {
      flexDirection: "column",
      backgroundColor: COLORS.bg,
      gap: 1, // Add spacing between story items
    },
  });

  panel.add(scroll);

  return {
    panel,
    scroll,
    items: new Map(),
  };
}

export function renderStoryList(
  ctx: RenderContext,
  state: StoryListState,
  posts: HackerNewsPost[],
  selectedIndex: number,
  callbacks: StoryItemCallbacks,
): void {
  // Clear existing items
  for (const child of state.scroll.getChildren()) {
    state.scroll.remove(child.id);
  }
  state.items.clear();

  posts.forEach((post, index) => {
    const isSelected = index === selectedIndex;
    const item = createStoryItem(ctx, post, index, isSelected, callbacks);
    state.items.set(index, item);
    state.scroll.add(item);
  });
}

export function updateStorySelection(
  state: StoryListState,
  posts: HackerNewsPost[],
  previousIndex: number,
  newIndex: number,
): void {
  // Update visual state of previous selection
  const previousItem = state.items.get(previousIndex);
  const previousPost = posts[previousIndex];
  if (previousItem && previousPost) {
    updateStoryItemStyle(previousItem, previousPost, false);
  }

  // Update visual state of new selection
  const newItem = state.items.get(newIndex);
  const newPost = posts[newIndex];
  if (newItem && newPost) {
    updateStoryItemStyle(newItem, newPost, true);
  }
}

export function scrollToStory(
  state: StoryListState,
  index: number,
): void {
  const itemHeight = 2; // Each story item is ~2 lines
  const gap = 1; // Gap between items
  const itemTop = index * (itemHeight + gap);
  const itemBottom = itemTop + itemHeight;
  const viewportHeight = state.scroll.height;
  const currentScroll = state.scroll.scrollTop;

  // Only scroll if the item is outside the visible viewport
  if (itemTop < currentScroll) {
    // Item is above viewport - scroll up to show it at top
    state.scroll.scrollTop = itemTop;
  } else if (itemBottom > currentScroll + viewportHeight) {
    // Item is below viewport - scroll down to show it at bottom
    state.scroll.scrollTop = itemBottom - viewportHeight;
  }
  // Otherwise, item is already visible - don't scroll
}
