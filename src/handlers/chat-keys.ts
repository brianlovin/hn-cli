/**
 * Chat mode keyboard handlers
 */
import type { RenderContext } from "@opentui/core";
import type { KeyEvent } from "../types";
import type { ChatPanelState } from "../components/ChatPanel";
import { renderSuggestions } from "../components/Suggestions";
import {
  renderSlashCommands,
  filterCommands,
  navigateSlashCommands,
  getSelectedCommand,
  showSlashCommands,
  hideSlashCommands,
} from "../components/SlashCommands";

export interface ChatKeyCallbacks {
  hideChatView: () => void;
  navigateStory: (delta: number) => void;
  sendChatMessage: () => void;
  selectSuggestion: () => void;
}

/**
 * Updates slash commands visibility and filtering based on input text.
 * Returns true if slash commands are active (input starts with "/" and no space).
 */
function updateSlashCommandsState(
  ctx: RenderContext,
  chatPanelState: ChatPanelState,
): boolean {
  const inputText = chatPanelState.input?.plainText ?? "";
  const slashState = chatPanelState.slashCommands;
  const suggestionsState = chatPanelState.suggestions;

  // Extract query after "/"
  const query = inputText.startsWith("/") ? inputText.slice(1) : "";

  // Check if input starts with "/" AND query has no space (space breaks typeahead)
  const isValidSlashMode = inputText.startsWith("/") && !query.includes(" ");

  if (isValidSlashMode) {
    // Show slash commands if not already visible
    if (!slashState.isVisible) {
      showSlashCommands(slashState);
      // Hide suggestions panel (but keep data loading in background)
      suggestionsState.hidden = true;
      renderSuggestions(ctx, suggestionsState);
    }

    // Filter commands based on query
    filterCommands(slashState, query);
    renderSlashCommands(ctx, slashState);
    return true;
  } else {
    // Hide slash commands if visible
    if (slashState.isVisible) {
      hideSlashCommands(slashState);
      renderSlashCommands(ctx, slashState);
      // Show suggestions panel again
      suggestionsState.hidden = false;
      renderSuggestions(ctx, suggestionsState);
    }
    return false;
  }
}

export function handleChatKey(
  key: KeyEvent,
  ctx: RenderContext,
  chatPanelState: ChatPanelState,
  callbacks: ChatKeyCallbacks
): void {
  if (key.name === "escape") {
    // If slash commands are visible, hide them and clear input
    if (chatPanelState.slashCommands?.isVisible) {
      hideSlashCommands(chatPanelState.slashCommands);
      renderSlashCommands(ctx, chatPanelState.slashCommands);
      chatPanelState.input?.clear();
      // Show suggestions panel again
      chatPanelState.suggestions.hidden = false;
      renderSuggestions(ctx, chatPanelState.suggestions);
      return;
    }
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
  const slashState = chatPanelState.slashCommands;

  // Check if we're in slash command mode (starts with "/" and no space in query)
  const inputText = chatPanelState.input?.plainText ?? "";
  const slashQuery = inputText.startsWith("/") ? inputText.slice(1) : "";
  const isSlashMode = inputText.startsWith("/") && !slashQuery.includes(" ");

  // Slash command navigation with up/down keys
  if (isSlashMode && slashState?.isVisible && slashState.filteredCommands.length > 0) {
    if (key.name === "up" || key.name === "k") {
      // Navigate up in slash commands
      if (slashState.selectedIndex > 0) {
        navigateSlashCommands(slashState, -1);
        renderSlashCommands(ctx, slashState);
      }
      return;
    } else if (key.name === "down" || key.name === "j") {
      // Navigate down in slash commands
      if (slashState.selectedIndex < slashState.filteredCommands.length - 1) {
        navigateSlashCommands(slashState, 1);
        renderSlashCommands(ctx, slashState);
      }
      return;
    }
  }

  // Suggestion navigation when input is empty (and not in slash mode)
  if (
    !isSlashMode &&
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

  // Handle Enter key for chat submission or slash command execution
  if ((key.name === "return" || key.name === "enter") && !key.shift) {
    // Execute slash command if in slash mode
    if (isSlashMode && slashState?.isVisible) {
      const selectedCommand = getSelectedCommand(slashState);
      if (selectedCommand) {
        // Clear input and hide slash commands first
        chatPanelState.input?.clear();
        hideSlashCommands(slashState);
        renderSlashCommands(ctx, slashState);
        // Show suggestions panel again before executing command
        chatPanelState.suggestions.hidden = false;
        renderSuggestions(ctx, chatPanelState.suggestions);
        // Execute the command
        selectedCommand.handler();
        return;
      }
      return;
    }

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

  // Focus input when user starts typing a printable character
  // This handles both: 1) typing while browsing suggestions, 2) typing when no suggestions exist
  if (
    key.sequence &&
    key.sequence.length === 1 &&
    !key.ctrl &&
    !key.meta
  ) {
    const charCode = key.sequence.charCodeAt(0);
    if (charCode >= 32 && charCode <= 126) {
      // Focus input if it's not already focused
      if (chatPanelState.input && !chatPanelState.input.focused) {
        chatPanelState.input.focus();
      }

      // Check if typing "/" as first character (will show slash commands)
      // We need to handle this after the character is inserted, so use setTimeout
      if (key.sequence === "/" && !inputText) {
        setTimeout(() => {
          updateSlashCommandsState(ctx, chatPanelState);
        }, 0);
        return;
      }

      // Update slash commands state for any typing while in slash mode
      if (isSlashMode) {
        setTimeout(() => {
          updateSlashCommandsState(ctx, chatPanelState);
        }, 0);
        return;
      }

      // Clear suggestions if they exist (only when not entering slash mode)
      if (suggestionsState.suggestions.length > 0) {
        suggestionsState.suggestions = [];
        suggestionsState.selectedIndex = -1;
        renderSuggestions(ctx, suggestionsState);
      }
    }
  }

  // Handle backspace - may need to update slash commands or restore suggestions
  if (key.name === "backspace" && chatPanelState.input) {
    setTimeout(() => {
      // Re-check state validity since chat panel may have been closed
      if (!chatPanelState?.input || !chatPanelState?.suggestions) return;

      const newInputText = chatPanelState.input.plainText;

      // Update slash commands state (may show or hide based on "/" prefix)
      const stillInSlashMode = updateSlashCommandsState(ctx, chatPanelState);

      // Restore suggestions when backspace clears the input (and not in slash mode)
      if (
        !stillInSlashMode &&
        !newInputText.trim() &&
        chatPanelState.suggestions.originalSuggestions.length > 0 &&
        chatPanelState.suggestions.suggestions.length === 0
      ) {
        chatPanelState.suggestions.suggestions = [...chatPanelState.suggestions.originalSuggestions];
        chatPanelState.suggestions.selectedIndex = chatPanelState.suggestions.suggestions.length - 1;
        renderSuggestions(ctx, chatPanelState.suggestions);
      }
    }, 10);
  }
}
