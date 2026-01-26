import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type TextareaRenderable,
  type RenderContext,
} from "@opentui/core";
import type { HackerNewsPost } from "../types";
import { COLORS } from "../theme";
import { createShortcutsBar, CHAT_SHORTCUTS } from "./ShortcutsBar";
import { createSuggestionsContainer, type SuggestionsState, initSuggestionsState } from "./Suggestions";
import { createChatInput } from "./ChatInput";
import { createStoryHeader } from "./StoryHeader";
import type { Provider } from "../config";
import { LOADING_CHARS } from "../utils";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatPanelCallbacks {
  onOpenStoryUrl: () => void;
  onSubmit: () => void;
}

export interface ChatPanelState {
  panel: BoxRenderable;
  scroll: ScrollBoxRenderable;
  content: BoxRenderable;
  input: TextareaRenderable;
  suggestions: SuggestionsState;
  messages: ChatMessage[];
  isActive: boolean;
  // Typing indicator state
  isTyping: boolean;
  typingFrame: number;
  typingInterval: ReturnType<typeof setInterval> | null;
}

export function createChatPanel(
  ctx: RenderContext,
  post: HackerNewsPost,
  callbacks: ChatPanelCallbacks,
): ChatPanelState {
  // Create chat scroll area
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

  // Create suggestions container
  const suggestionsContainer = createSuggestionsContainer(ctx);
  const suggestionsState = initSuggestionsState(suggestionsContainer);

  // Create input area
  const chatInputState = createChatInput(ctx, {
    onSubmit: callbacks.onSubmit,
  });

  // Create shortcuts bar for chat
  const chatShortcutsBar = createShortcutsBar(ctx, CHAT_SHORTCUTS);

  // Create chat panel container
  const panel = new BoxRenderable(ctx, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: COLORS.bg,
  });

  // Add header showing we're chatting about this story
  const { container: chatHeader } = createStoryHeader(ctx, post, {
    onOpenStoryUrl: callbacks.onOpenStoryUrl,
  });

  panel.add(chatHeader);
  panel.add(scroll);
  panel.add(suggestionsContainer);
  panel.add(chatInputState.container);
  panel.add(chatShortcutsBar);

  return {
    panel,
    scroll,
    content,
    input: chatInputState.input,
    suggestions: suggestionsState,
    messages: [],
    isActive: true,
    isTyping: false,
    typingFrame: 0,
    typingInterval: null,
  };
}

export function renderChatMessages(
  ctx: RenderContext,
  state: ChatPanelState,
  provider: Provider,
): void {
  if (!state.content) return;

  // Clear existing messages
  for (const child of state.content.getChildren()) {
    state.content.remove(child.id);
  }

  // Find the index of the last user message to determine the "current exchange"
  // The current exchange = last user message + any following assistant messages
  let lastUserIndex = -1;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  // Render each message
  for (let i = 0; i < state.messages.length; i++) {
    const msg = state.messages[i];
    if (!msg) continue;

    // Messages in the current exchange (last user message + responses) are bright
    // Earlier messages are dimmed
    const isCurrentExchange = i >= lastUserIndex && lastUserIndex !== -1;

    const msgBox = new BoxRenderable(ctx, {
      width: "100%",
      flexDirection: "column",
      marginBottom: 1,
    });

    // Header row with dot and name
    const headerRow = new BoxRenderable(ctx, {
      flexDirection: "row",
      gap: 1,
    });

    const dotColor = msg.role === "user" ? COLORS.accent : COLORS.link;
    const dot = new TextRenderable(ctx, {
      content: "\u2022",
      fg: dotColor,
    });
    headerRow.add(dot);

    const assistantName = provider === "anthropic" ? "Claude" : "GPT";
    const roleLabel = new TextRenderable(ctx, {
      content: msg.role === "user" ? "You" : assistantName,
      fg: dotColor,
    });
    headerRow.add(roleLabel);

    msgBox.add(headerRow);

    // Content indented by 2 spaces (aligns with text after dot)
    const contentBox = new BoxRenderable(ctx, {
      width: "100%",
      paddingLeft: 2,
    });
    const contentText = new TextRenderable(ctx, {
      content: msg.content,
      fg: isCurrentExchange ? COLORS.textPrimary : COLORS.textSecondary,
      wrapMode: "word",
    });
    contentBox.add(contentText);
    msgBox.add(contentBox);

    state.content.add(msgBox);
  }

  // Scroll to bottom
  scrollChatToBottom(state);
}

export function scrollChatToBottom(state: ChatPanelState): void {
  if (!state.scroll || !state.isActive) return;

  // Immediate scroll
  state.scroll.scrollTop = state.scroll.scrollHeight;

  // Follow-up scrolls to handle layout recalculation
  setTimeout(() => {
    if (state.scroll && state.isActive) {
      state.scroll.scrollTop = state.scroll.scrollHeight;
    }
  }, 50);

  setTimeout(() => {
    if (state.scroll && state.isActive) {
      state.scroll.scrollTop = state.scroll.scrollHeight;
    }
  }, 150);
}

export function addChatMessage(
  ctx: RenderContext,
  state: ChatPanelState,
  role: "user" | "assistant",
  content: string,
  provider: Provider,
): void {
  state.messages.push({ role, content });
  renderChatMessages(ctx, state, provider);
}

export function startTypingIndicator(
  ctx: RenderContext,
  state: ChatPanelState,
  provider: Provider,
): void {
  if (state.typingInterval) return; // Already running

  state.isTyping = true;
  state.typingFrame = 0;

  state.typingInterval = setInterval(() => {
    if (!state.isActive || !state.isTyping) {
      stopTypingIndicator(state);
      return;
    }

    state.typingFrame = (state.typingFrame + 1) % LOADING_CHARS.length;

    // Update the last message (the placeholder) with the typing indicator
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant" && lastMsg.content === "...") {
      const char = LOADING_CHARS[state.typingFrame] ?? "\u280B";
      lastMsg.content = char;
      renderChatMessages(ctx, state, provider);
      // Reset to "..." so the next frame updates correctly
      lastMsg.content = "...";
    }
  }, 80);
}

export function stopTypingIndicator(state: ChatPanelState): void {
  state.isTyping = false;
  if (state.typingInterval) {
    clearInterval(state.typingInterval);
    state.typingInterval = null;
  }
}
