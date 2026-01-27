import { describe, it, expect, mock, beforeEach } from "bun:test";
import { handleMainKey, handleAuthSetupKey, handleSettingsKey } from "../handlers";
import type { KeyEvent } from "../types";
import type { AuthSetupState } from "../components/AuthSetup";
import type { SettingsState } from "../components/SettingsPanel";

// Mock telemetry module
mock.module("../telemetry", () => ({
  track: mock(() => {}),
}));

describe("Main Key Handler", () => {
  let callbacks: {
    navigateStory: ReturnType<typeof mock>;
    navigateToNextComment: ReturnType<typeof mock>;
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
