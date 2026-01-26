import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import type { HackerNewsPost } from "../types";
import { COLORS } from "../theme";
import {
  createStoryItem,
  updateStoryItemStyle,
  updateStoryChevron,
  type StoryItemCallbacks,
} from "./StoryItem";
import { createShortcutsBar, STORY_LIST_SHORTCUTS } from "./ShortcutsBar";

export interface StoryListState {
  panel: BoxRenderable;
  scroll: ScrollBoxRenderable;
  shortcutsBar: BoxRenderable;
  items: Map<number, BoxRenderable>;
  notificationBox: BoxRenderable;
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

  // Shortcuts bar at the bottom of the story list
  const shortcutsBar = createShortcutsBar(ctx, STORY_LIST_SHORTCUTS);

  // Notification box (hidden by default - inserted into scroll area to get gap styling)
  const notificationBox = new BoxRenderable(ctx, {
    id: "story-list-notification-box",
    width: "100%",
    flexDirection: "row",
  });
  // Icon to match story item keyline
  const notificationIcon = new TextRenderable(ctx, {
    id: "story-list-notification-icon",
    content: "?",
    fg: COLORS.textTertiary,
    width: 2,
    paddingLeft: 1,
  });
  const notificationText = new TextRenderable(ctx, {
    id: "story-list-notification-text",
    content: "",
    fg: COLORS.textSecondary,
  });
  notificationBox.add(notificationIcon);
  notificationBox.add(notificationText);

  panel.add(scroll);
  panel.add(shortcutsBar);

  return {
    panel,
    scroll,
    shortcutsBar,
    items: new Map(),
    notificationBox,
  };
}

export function showStoryListNotification(
  state: StoryListState,
  message: string,
): void {
  // Update the notification text
  const textChild = state.notificationBox.getChildren()[1] as TextRenderable;
  if (textChild) {
    textChild.content = message;
  }

  // Add notification box to scroll area if not already present (at the top)
  const children = state.scroll.getChildren();
  const hasNotification = children.some((child) => child.id === state.notificationBox.id);
  if (!hasNotification) {
    // Remove all items, add notification first, then re-add items
    const items = children.filter((child) => child.id !== state.notificationBox.id);
    for (const item of items) {
      state.scroll.remove(item.id);
    }
    state.scroll.add(state.notificationBox);
    for (const item of items) {
      state.scroll.add(item);
    }
  }
}

export function hideStoryListNotification(state: StoryListState): void {
  state.scroll.remove(state.notificationBox.id);
}

export function renderStoryList(
  ctx: RenderContext,
  state: StoryListState,
  posts: HackerNewsPost[],
  selectedIndex: number,
  callbacks: StoryItemCallbacks,
): void {
  // Clear existing items (but preserve notification if present)
  for (const child of state.scroll.getChildren()) {
    if (child.id !== state.notificationBox.id) {
      state.scroll.remove(child.id);
    }
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

export function updateStoryIndicator(
  state: StoryListState,
  index: number,
  character: string,
): void {
  const item = state.items.get(index);
  if (item) {
    updateStoryChevron(item, character);
  }
}
