import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createAppTestContext, cleanupTestContext, type TestContext } from "./test-utils";
import { createMockPosts } from "./fixtures";

describe("Shortcuts Bar Display", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createAppTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it("should display detail shortcuts when story is selected", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();

    // Check for detail panel shortcuts
    expect(frame).toContain("next");
    expect(frame).toContain("open");
    expect(frame).toContain("chat");
    expect(frame).toContain("settings");
  });

  it("should display story list shortcuts (j/k navigate)", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();

    // Check for story list shortcuts
    expect(frame).toContain("j/k");
    expect(frame).toContain("navigate");
  });
});

describe("Keyboard Routing Priority", () => {
  it("should route keys correctly based on mode", () => {
    // Simulate the keyboard routing logic from handleKey
    type Mode = "main" | "chat" | "settings" | "authSetup";

    const getActiveMode = (state: {
      settingsMode: boolean;
      authSetupMode: boolean;
      chatMode: boolean;
    }): Mode => {
      if (state.settingsMode) return "settings";
      if (state.authSetupMode) return "authSetup";
      if (state.chatMode) return "chat";
      return "main";
    };

    // Main view
    expect(getActiveMode({ settingsMode: false, authSetupMode: false, chatMode: false })).toBe("main");

    // Chat mode
    expect(getActiveMode({ settingsMode: false, authSetupMode: false, chatMode: true })).toBe("chat");

    // Settings mode takes priority over chat mode flag
    expect(getActiveMode({ settingsMode: true, authSetupMode: false, chatMode: true })).toBe("settings");

    // Auth setup takes priority
    expect(getActiveMode({ settingsMode: false, authSetupMode: true, chatMode: false })).toBe("authSetup");
  });

  it("should handle 's' key correctly in each mode", () => {
    interface KeyHandlerResult {
      handled: boolean;
      action?: string;
    }

    const handleKeyInMode = (mode: string, key: string): KeyHandlerResult => {
      if (mode === "main") {
        if (key === "s") {
          return { handled: true, action: "showSettings" };
        }
      }
      if (mode === "chat") {
        // In chat mode, 's' goes to input, not settings
        return { handled: true, action: "passToInput" };
      }
      if (mode === "settings") {
        // In settings, 's' has no special meaning
        return { handled: false };
      }
      return { handled: false };
    };

    // Main view: 's' opens settings
    expect(handleKeyInMode("main", "s")).toEqual({ handled: true, action: "showSettings" });

    // Chat mode: 's' goes to input
    expect(handleKeyInMode("chat", "s")).toEqual({ handled: true, action: "passToInput" });

    // Settings mode: 's' is not handled
    expect(handleKeyInMode("settings", "s")).toEqual({ handled: false });
  });

  it("should handle escape key correctly in each mode", () => {
    interface EscapeResult {
      shouldExit: boolean;
      targetMode: string;
    }

    const handleEscapeInMode = (state: {
      mode: string;
      settingsFromChatMode: boolean;
      authSetupFromSettings: boolean;
    }): EscapeResult => {
      if (state.mode === "chat") {
        return { shouldExit: true, targetMode: "main" };
      }
      if (state.mode === "settings") {
        // Settings exits to chat if we came from chat
        return {
          shouldExit: true,
          targetMode: state.settingsFromChatMode ? "chat" : "main",
        };
      }
      if (state.mode === "authSetup") {
        // Auth setup exits to settings if we came from settings
        return {
          shouldExit: true,
          targetMode: state.authSetupFromSettings ? "settings" : "main",
        };
      }
      return { shouldExit: false, targetMode: "main" };
    };

    // Chat: escape goes to main
    expect(handleEscapeInMode({
      mode: "chat",
      settingsFromChatMode: false,
      authSetupFromSettings: false,
    })).toEqual({ shouldExit: true, targetMode: "main" });

    // Settings from main: escape goes to main
    expect(handleEscapeInMode({
      mode: "settings",
      settingsFromChatMode: false,
      authSetupFromSettings: false,
    })).toEqual({ shouldExit: true, targetMode: "main" });

    // Settings from chat: escape goes to chat
    expect(handleEscapeInMode({
      mode: "settings",
      settingsFromChatMode: true,
      authSetupFromSettings: false,
    })).toEqual({ shouldExit: true, targetMode: "chat" });

    // Auth setup from settings: escape goes to settings
    expect(handleEscapeInMode({
      mode: "authSetup",
      settingsFromChatMode: false,
      authSetupFromSettings: true,
    })).toEqual({ shouldExit: true, targetMode: "settings" });
  });
});
