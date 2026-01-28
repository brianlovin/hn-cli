import { describe, it, expect, mock, beforeEach } from "bun:test";
import { handleMainKey, handleAuthSetupKey, handleSettingsKey, handleChatKey } from "../handlers";
import type { KeyEvent } from "../types";
import type { AuthSetupState } from "../components/AuthSetup";
import type { SettingsState } from "../components/SettingsPanel";
import type { ChatPanelState } from "../components/ChatPanel";
import type { SuggestionsState } from "../components/Suggestions";
import type { SlashCommand, SlashCommandsState } from "../components/SlashCommands";

const renderSuggestionsMock = mock(() => {});
const renderSlashCommandsMock = mock(() => {});
const filterCommandsMock = mock(() => {});
const navigateSlashCommandsMock = mock(() => {});
const getSelectedCommandMock = mock<() => SlashCommand | null>(() => null);
const showSlashCommandsMock = mock(() => {});
const hideSlashCommandsMock = mock(() => {});

// Mock telemetry module
mock.module("../telemetry", () => ({
  track: mock(() => {}),
}));

// Mock the Suggestions component to avoid render context issues
mock.module("../components/Suggestions", () => ({
  renderSuggestions: renderSuggestionsMock,
}));

// Mock the SlashCommands component
mock.module("../components/SlashCommands", () => ({
  renderSlashCommands: renderSlashCommandsMock,
  filterCommands: filterCommandsMock,
  navigateSlashCommands: navigateSlashCommandsMock,
  getSelectedCommand: getSelectedCommandMock,
  showSlashCommands: showSlashCommandsMock,
  hideSlashCommands: hideSlashCommandsMock,
}));

describe("Main Key Handler", () => {
  let callbacks: {
    navigateStory: ReturnType<typeof mock>;
    navigateToNextComment: ReturnType<typeof mock>;
    scrollComments: ReturnType<typeof mock>;
    openStoryUrl: ReturnType<typeof mock>;
    openChat: ReturnType<typeof mock>;
    refresh: ReturnType<typeof mock>;
    handleTldrRequest: ReturnType<typeof mock>;
    showSettings: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    callbacks = {
      navigateStory: mock(() => {}),
      navigateToNextComment: mock(() => {}),
      scrollComments: mock(() => {}),
      openStoryUrl: mock(() => {}),
      openChat: mock(() => {}),
      refresh: mock(() => {}),
      handleTldrRequest: mock(() => {}),
      showSettings: mock(() => {}),
    };
  });

  it("should call navigateStory(1) on 'j' key", () => {
    handleMainKey({ name: "j" }, callbacks);
    expect(callbacks.navigateStory).toHaveBeenCalledWith(1);
  });

  it("should call navigateStory(-1) on 'k' key", () => {
    handleMainKey({ name: "k" }, callbacks);
    expect(callbacks.navigateStory).toHaveBeenCalledWith(-1);
  });

  it("should call navigateToNextComment on space key", () => {
    handleMainKey({ name: "space" }, callbacks);
    expect(callbacks.navigateToNextComment).toHaveBeenCalled();
  });

  it("should call scrollComments(3) on down arrow key", () => {
    handleMainKey({ name: "down" }, callbacks);
    expect(callbacks.scrollComments).toHaveBeenCalledWith(3);
  });

  it("should call scrollComments(-3) on up arrow key", () => {
    handleMainKey({ name: "up" }, callbacks);
    expect(callbacks.scrollComments).toHaveBeenCalledWith(-3);
  });

  it("should call openStoryUrl on 'o' key", () => {
    handleMainKey({ name: "o" }, callbacks);
    expect(callbacks.openStoryUrl).toHaveBeenCalled();
  });

  it("should call openChat on 'c' key", () => {
    handleMainKey({ name: "c" }, callbacks);
    expect(callbacks.openChat).toHaveBeenCalled();
  });

  it("should call refresh on 'r' key", () => {
    handleMainKey({ name: "r" }, callbacks);
    expect(callbacks.refresh).toHaveBeenCalled();
  });

  it("should call handleTldrRequest on 't' key", () => {
    handleMainKey({ name: "t" }, callbacks);
    expect(callbacks.handleTldrRequest).toHaveBeenCalled();
  });

  it("should call showSettings on 's' key", () => {
    handleMainKey({ name: "s" }, callbacks);
    expect(callbacks.showSettings).toHaveBeenCalled();
  });

  it("should not call any callback on unknown key", () => {
    handleMainKey({ name: "x" }, callbacks);
    expect(callbacks.navigateStory).not.toHaveBeenCalled();
    expect(callbacks.navigateToNextComment).not.toHaveBeenCalled();
    expect(callbacks.scrollComments).not.toHaveBeenCalled();
    expect(callbacks.openStoryUrl).not.toHaveBeenCalled();
    expect(callbacks.openChat).not.toHaveBeenCalled();
    expect(callbacks.refresh).not.toHaveBeenCalled();
    expect(callbacks.handleTldrRequest).not.toHaveBeenCalled();
    expect(callbacks.showSettings).not.toHaveBeenCalled();
  });
});

describe("Auth Setup Key Handler", () => {
  let callbacks: {
    hideAuthSetup: ReturnType<typeof mock>;
    showAuthSetupUI: ReturnType<typeof mock>;
  };

  const createAuthState = (overrides?: Partial<AuthSetupState>): AuthSetupState => ({
    step: "provider",
    selectedProvider: "anthropic",
    keyInput: null,
    ...overrides,
  });

  beforeEach(() => {
    callbacks = {
      hideAuthSetup: mock(() => {}),
      showAuthSetupUI: mock(() => {}),
    };
  });

  it("should call hideAuthSetup on escape key", () => {
    const state = createAuthState();
    handleAuthSetupKey({ name: "escape" }, state, callbacks);
    expect(callbacks.hideAuthSetup).toHaveBeenCalled();
  });

  it("should navigate down on 'j' key in provider step", () => {
    const state = createAuthState();
    handleAuthSetupKey({ name: "j" }, state, callbacks);
    expect(callbacks.showAuthSetupUI).toHaveBeenCalled();
    expect(state.selectedProvider).toBe("openai");
  });

  it("should navigate up on 'k' key in provider step", () => {
    const state = createAuthState({ selectedProvider: "openai" });
    handleAuthSetupKey({ name: "k" }, state, callbacks);
    expect(callbacks.showAuthSetupUI).toHaveBeenCalled();
    expect(state.selectedProvider).toBe("anthropic");
  });

  it("should confirm on enter key in provider step", () => {
    const state = createAuthState();
    handleAuthSetupKey({ name: "return" }, state, callbacks);
    expect(callbacks.showAuthSetupUI).toHaveBeenCalled();
    expect(state.step).toBe("key");
  });

  it("should not navigate when in key step", () => {
    const state = createAuthState({ step: "key" });
    handleAuthSetupKey({ name: "j" }, state, callbacks);
    expect(callbacks.showAuthSetupUI).not.toHaveBeenCalled();
  });
});

describe("Settings Key Handler", () => {
  let callbacks: {
    hideSettings: ReturnType<typeof mock>;
    rerenderSettings: ReturnType<typeof mock>;
    handleSettingsAction: ReturnType<typeof mock>;
    openUrl: ReturnType<typeof mock>;
  };

  // Create a minimal mock of SettingsState for testing
  // Note: Navigation tests (j/k keys) require full UI components and are covered
  // by integration tests in app.test.ts
  const createSettingsState = (overrides?: Partial<SettingsState>): SettingsState => ({
    selectedIndex: 0,
    header: {} as any,
    scroll: {} as any,
    content: {} as any,
    shortcutsBar: {} as any,
    ...overrides,
  });

  beforeEach(() => {
    callbacks = {
      hideSettings: mock(() => {}),
      rerenderSettings: mock(() => {}),
      handleSettingsAction: mock(() => {}),
      openUrl: mock(() => {}),
    };
  });

  it("should call hideSettings on escape key (goBackInSettings returns false)", () => {
    const state = createSettingsState();
    handleSettingsKey({ name: "escape" }, state, "anthropic", callbacks);
    // goBackInSettings always returns false, so hideSettings is called
    expect(callbacks.hideSettings).toHaveBeenCalled();
  });

  it("should rerender on 'r' key (reset settings)", () => {
    const state = createSettingsState();
    handleSettingsKey({ name: "r" }, state, "anthropic", callbacks);
    expect(callbacks.rerenderSettings).toHaveBeenCalled();
  });

  // Note: Navigation tests for j/k/up/down keys require full UI component state
  // with working ScrollBoxRenderable. These are covered by the existing integration
  // tests in app.test.ts that test the full keyboard flow through the app.
});

describe("KeyEvent type consistency", () => {
  it("should accept minimal key events", () => {
    const minimalKey: KeyEvent = { name: "j" };
    expect(minimalKey.name).toBe("j");
  });

  it("should accept full key events", () => {
    const fullKey: KeyEvent = {
      name: "j",
      shift: false,
      super: true,
      ctrl: false,
      meta: true,
      sequence: "j",
    };
    expect(fullKey.super).toBe(true);
    expect(fullKey.meta).toBe(true);
  });
});

describe("Chat Key Handler", () => {
  let callbacks: {
    hideChatView: ReturnType<typeof mock>;
    navigateStory: ReturnType<typeof mock>;
    sendChatMessage: ReturnType<typeof mock>;
    selectSuggestion: ReturnType<typeof mock>;
  };

  // Create a mock input that tracks focus state
  const createMockInput = (options?: { focused?: boolean; plainText?: string }) => {
    let focusedState = options?.focused ?? false;
    return {
      get focused() { return focusedState; },
      focus: mock(() => { focusedState = true; }),
      blur: mock(() => { focusedState = false; }),
      clear: mock(() => {}),
      insertText: mock(() => {}),
      get plainText() { return options?.plainText ?? ""; },
    };
  };

  const createSuggestionsState = (suggestions: string[] = []): SuggestionsState => ({
    container: {} as any,
    suggestions,
    originalSuggestions: [...suggestions],
    selectedIndex: suggestions.length > 0 ? suggestions.length - 1 : -1,
    loading: false,
    loadingFrame: 0,
    hidden: false,
  });

  const createSlashCommandsState = (): SlashCommandsState => ({
    container: {} as any,
    commands: [{ name: "clear", description: "Clear chat history", handler: mock(() => {}) }],
    filteredCommands: [{ name: "clear", description: "Clear chat history", handler: mock(() => {}) }],
    selectedIndex: 0,
    isVisible: false,
    query: "",
  });

  const createChatState = (options?: {
    suggestions?: string[];
    inputFocused?: boolean;
    inputText?: string;
  }): ChatPanelState => ({
    panel: {} as any,
    scroll: {} as any,
    content: {} as any,
    input: createMockInput({ focused: options?.inputFocused, plainText: options?.inputText }) as any,
    suggestions: createSuggestionsState(options?.suggestions),
    slashCommands: createSlashCommandsState(),
    messages: [],
    isActive: true,
    isTyping: false,
    typingFrame: 0,
    typingInterval: null,
  });

  beforeEach(() => {
    callbacks = {
      hideChatView: mock(() => {}),
      navigateStory: mock(() => {}),
      sendChatMessage: mock(() => {}),
      selectSuggestion: mock(() => {}),
    };
    getSelectedCommandMock.mockReturnValue(null);
    renderSuggestionsMock.mockClear();
  });

  it("should call hideChatView on escape key", () => {
    const state = createChatState();
    handleChatKey({ name: "escape" }, {} as any, state, callbacks);
    expect(callbacks.hideChatView).toHaveBeenCalled();
  });

  it("should navigate stories with Cmd+j/k", () => {
    const state = createChatState();
    handleChatKey({ name: "j", super: true }, {} as any, state, callbacks);
    expect(callbacks.navigateStory).toHaveBeenCalledWith(1);

    handleChatKey({ name: "k", super: true }, {} as any, state, callbacks);
    expect(callbacks.navigateStory).toHaveBeenCalledWith(-1);
  });

  it("should focus input when typing printable character with suggestions present", () => {
    const state = createChatState({ suggestions: ["question 1", "question 2"], inputFocused: false });
    handleChatKey({ name: "a", sequence: "a" }, {} as any, state, callbacks);

    expect(state.input.focus).toHaveBeenCalled();
    expect(state.suggestions.suggestions).toEqual([]);
    expect(state.suggestions.selectedIndex).toBe(-1);
  });

  it("should focus input when typing printable character with NO suggestions (bug fix)", () => {
    // This tests the bug fix: user should be able to type even when suggestions are empty
    // (e.g., after MAX_FOLLOW_UP_ROUNDS is reached)
    const state = createChatState({ suggestions: [], inputFocused: false });
    handleChatKey({ name: "h", sequence: "h" }, {} as any, state, callbacks);

    expect(state.input.focus).toHaveBeenCalled();
  });

  it("should not re-focus input if already focused", () => {
    const state = createChatState({ suggestions: [], inputFocused: true });
    handleChatKey({ name: "h", sequence: "h" }, {} as any, state, callbacks);

    // Focus should not be called since it's already focused
    expect(state.input.focus).not.toHaveBeenCalled();
  });

  it("should navigate suggestions with up/down keys when input is empty", () => {
    const state = createChatState({ suggestions: ["q1", "q2", "q3"], inputFocused: false, inputText: "" });
    state.suggestions.selectedIndex = 2; // Start at last suggestion

    handleChatKey({ name: "up" }, {} as any, state, callbacks);
    expect(state.suggestions.selectedIndex).toBe(1);

    handleChatKey({ name: "down" }, {} as any, state, callbacks);
    expect(state.suggestions.selectedIndex).toBe(2);
  });

  it("should focus input when navigating down past last suggestion", () => {
    const state = createChatState({ suggestions: ["q1", "q2"], inputFocused: false, inputText: "" });
    state.suggestions.selectedIndex = 1; // At last suggestion

    handleChatKey({ name: "down" }, {} as any, state, callbacks);

    expect(state.suggestions.selectedIndex).toBe(-1);
    expect(state.input.focus).toHaveBeenCalled();
  });

  it("should call selectSuggestion on enter when suggestion is selected", () => {
    const state = createChatState({ suggestions: ["q1"], inputFocused: false, inputText: "" });
    state.suggestions.selectedIndex = 0;

    handleChatKey({ name: "return" }, {} as any, state, callbacks);
    expect(callbacks.selectSuggestion).toHaveBeenCalled();
  });

  it("should call sendChatMessage on enter when input has text", () => {
    const state = createChatState({ suggestions: [], inputFocused: true, inputText: "hello" });

    handleChatKey({ name: "return" }, {} as any, state, callbacks);
    expect(callbacks.sendChatMessage).toHaveBeenCalled();
  });

  it("should not call sendChatMessage on shift+enter (for newline)", () => {
    const state = createChatState({ suggestions: [], inputFocused: true, inputText: "hello" });

    handleChatKey({ name: "return", shift: true }, {} as any, state, callbacks);
    expect(callbacks.sendChatMessage).not.toHaveBeenCalled();
  });

  it("should insert suggestion on tab and focus input", () => {
    const state = createChatState({ suggestions: ["What is the summary?"], inputFocused: false });
    state.suggestions.selectedIndex = 0;

    handleChatKey({ name: "tab" }, {} as any, state, callbacks);

    expect(state.input.focus).toHaveBeenCalled();
    expect(state.input.clear).toHaveBeenCalled();
    expect(state.input.insertText).toHaveBeenCalledWith("What is the summary? ");
    expect(state.suggestions.suggestions).toEqual([]);
  });

  it("should unhide suggestions when executing a slash command", () => {
    const state = createChatState({ suggestions: ["q1"], inputFocused: true, inputText: "/clear" });
    state.suggestions.hidden = true;
    state.slashCommands.isVisible = true;
    const handler = mock(() => {});
    getSelectedCommandMock.mockReturnValue({
      name: "clear",
      description: "Clear chat history",
      handler,
    });

    handleChatKey({ name: "return" }, {} as any, state, callbacks);

    expect(state.suggestions.hidden).toBe(false);
    expect(renderSuggestionsMock).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });
});
