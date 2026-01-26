import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  TextareaRenderable,
  type RenderContext,
} from "@opentui/core";
import type { HackerNewsPost } from "../types";
import { COLORS } from "../theme";
import { createShortcutsBar, CHAT_SHORTCUTS } from "./ShortcutsBar";
import { createSuggestionsContainer, type SuggestionsState, initSuggestionsState } from "./Suggestions";
import { createChatInput } from "./ChatInput";
import { createStoryHeader } from "./StoryHeader";
import type { Provider } from "../config";

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

  // Render each message
  for (const msg of state.messages) {
    const msgBox = new BoxRenderable(ctx, {
      width: "100%",
      flexDirection: "column",
      marginBottom: 1,
    });

    const assistantName = provider === "anthropic" ? "Claude" : "GPT";
    const roleLabel = new TextRenderable(ctx, {
      content: msg.role === "user" ? "You" : assistantName,
      fg: msg.role === "user" ? COLORS.accent : COLORS.link,
    });
    msgBox.add(roleLabel);

    const contentText = new TextRenderable(ctx, {
      content: msg.content,
      fg: COLORS.text,
      wrapMode: "word",
    });
    msgBox.add(contentText);

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
