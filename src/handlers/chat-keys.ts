/**
 * Chat mode keyboard handlers
 */
import type { RenderContext } from "@opentui/core";
import type { KeyEvent } from "../types";
import type { ChatPanelState } from "../components/ChatPanel";
import { renderSuggestions } from "../components/Suggestions";

export interface ChatKeyCallbacks {
  hideChatView: () => void;
  navigateStory: (delta: number) => void;
  sendChatMessage: () => void;
  selectSuggestion: () => void;
}

export function handleChatKey(
  key: KeyEvent,
  ctx: RenderContext,
  chatPanelState: ChatPanelState,
  callbacks: ChatKeyCallbacks
): void {
  if (key.name === "escape") {
    callbacks.hideChatView();
    return;
  }

  // Cmd+j/Cmd+k to navigate between stories
  if (key.super && (key.name === "j" || key.name === "k")) {
    const delta = key.name === "j" ? 1 : -1;
    callbacks.navigateStory(delta);
    return;
  }

  const suggestionsState = chatPanelState.suggestions;

  // Suggestion navigation when input is empty
  if (
    suggestionsState.suggestions.length > 0 &&
    chatPanelState.input &&
    !chatPanelState.input.plainText.trim()
  ) {
    if (key.name === "up" || key.name === "k") {
      if (suggestionsState.selectedIndex === -1) {
        // Input was focused with no selection, select the last suggestion
        suggestionsState.selectedIndex = suggestionsState.suggestions.length - 1;
      } else if (suggestionsState.selectedIndex > 0) {
        // Move up in suggestions
        suggestionsState.selectedIndex--;
      }
      // Blur input when navigating suggestions
      chatPanelState.input.blur();
      renderSuggestions(ctx, suggestionsState);
      return;
    } else if (key.name === "down" || key.name === "j") {
      if (suggestionsState.selectedIndex === suggestionsState.suggestions.length - 1) {
        // At the last suggestion, focus the input and deselect
        suggestionsState.selectedIndex = -1;
        chatPanelState.input.focus();
      } else if (suggestionsState.selectedIndex >= 0) {
        // Move down in suggestions, blur input
        suggestionsState.selectedIndex++;
        chatPanelState.input.blur();
      }
      renderSuggestions(ctx, suggestionsState);
      return;
    }
  }

  // Handle Tab key to insert suggestion into input for editing
  if (
    key.name === "tab" &&
    suggestionsState.selectedIndex >= 0 &&
    suggestionsState.suggestions.length > 0
  ) {
    const suggestion = suggestionsState.suggestions[suggestionsState.selectedIndex];
    if (suggestion && chatPanelState.input) {
      chatPanelState.input.focus();
      chatPanelState.input.clear();
      chatPanelState.input.insertText(suggestion + " ");
      // Clear suggestions so user can type freely
      suggestionsState.suggestions = [];
      suggestionsState.selectedIndex = -1;
      renderSuggestions(ctx, suggestionsState);
      return;
    }
  }

  // Handle Enter key for chat submission
  if ((key.name === "return" || key.name === "enter") && !key.shift) {
    if (chatPanelState.input && chatPanelState.input.plainText.trim()) {
      callbacks.sendChatMessage();
      return;
    }
    if (suggestionsState.selectedIndex >= 0 && suggestionsState.suggestions.length > 0) {
      callbacks.selectSuggestion();
      return;
    }
    return;
  }

  // Clear suggestions and focus input when user starts typing
  if (
    suggestionsState.suggestions.length > 0 &&
    key.sequence &&
    key.sequence.length === 1 &&
    !key.ctrl &&
    !key.meta
  ) {
    const charCode = key.sequence.charCodeAt(0);
    if (charCode >= 32 && charCode <= 126) {
      // Focus input if it was blurred while browsing suggestions
      if (chatPanelState.input) {
        chatPanelState.input.focus();
      }
      suggestionsState.suggestions = [];
      suggestionsState.selectedIndex = -1;
      renderSuggestions(ctx, suggestionsState);
    }
  }

  // Restore suggestions when backspace clears the input
  if (
    key.name === "backspace" &&
    chatPanelState.input &&
    suggestionsState.originalSuggestions.length > 0
  ) {
    // Capture original suggestions to avoid closure over potentially stale state
    const originalSuggestions = [...suggestionsState.originalSuggestions];
    setTimeout(() => {
      // Re-check state validity since chat panel may have been closed
      if (
        chatPanelState?.input &&
        chatPanelState?.suggestions &&
        !chatPanelState.input.plainText.trim() &&
        chatPanelState.suggestions.suggestions.length === 0
      ) {
        chatPanelState.suggestions.suggestions = [...originalSuggestions];
        chatPanelState.suggestions.selectedIndex = chatPanelState.suggestions.suggestions.length - 1;
        renderSuggestions(ctx, chatPanelState.suggestions);
      }
    }, 10);
  }
}
