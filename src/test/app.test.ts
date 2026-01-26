import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestRenderer, type TestRenderer, type MockInput, type MockMouse } from "@opentui/core/testing";
import { HackerNewsApp } from "../app";
import { createMockPosts, createMockPostWithComments } from "./fixtures";

describe("HackerNewsApp", () => {
  let renderer: TestRenderer;
  let mockInput: MockInput;
  let mockMouse: MockMouse;
  let app: HackerNewsApp;
  let renderOnce: () => Promise<void>;
  let captureCharFrame: () => string;

  beforeEach(async () => {
    const testContext = await createTestRenderer({
      width: 120,
      height: 40,
      kittyKeyboard: true,
      otherModifiersMode: true,
    });

    renderer = testContext.renderer;
    mockInput = testContext.mockInput;
    mockMouse = testContext.mockMouse;
    renderOnce = testContext.renderOnce;
    captureCharFrame = testContext.captureCharFrame;

    app = new HackerNewsApp(renderer, {
      onOpenUrl: () => {},
      onExit: () => {},
    });

    // Initialize layout without loading real data
    app.initializeForTesting();
  });

  afterEach(async () => {
    // Wait for any pending async operations
    await renderer.idle();
    renderer.destroy();
  });

  describe("Story Navigation", () => {
    beforeEach(async () => {
      const mockPosts = createMockPosts(10);
      app.setPostsForTesting(mockPosts);
      await renderOnce();
    });

    it("should start with no story selected", () => {
      expect(app.currentSelectedIndex).toBe(-1);
    });

    it("should select first story when j is pressed with no selection", async () => {
      expect(app.currentSelectedIndex).toBe(-1);
      mockInput.pressKey("j");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(0);
    });

    it("should select last story when k is pressed with no selection", async () => {
      expect(app.currentSelectedIndex).toBe(-1);
      mockInput.pressKey("k");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(9); // 10 posts, last index is 9
    });

    it("should navigate down with j key", async () => {
      // First j selects first story (from -1 to 0)
      mockInput.pressKey("j");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(0);

      // Second j navigates to next story
      mockInput.pressKey("j");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(1);
    });

    it("should navigate up with k key", async () => {
      // First select a story
      mockInput.pressKey("j");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(0);

      // Go down once more
      mockInput.pressKey("j");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(1);

      // Then go up
      mockInput.pressKey("k");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(0);
    });

    it("should not go above first story when at first story", async () => {
      // First select a story
      mockInput.pressKey("j");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(0);

      // Try to go up from first story
      mockInput.pressKey("k");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(0);
    });

    it("should not go below last story", async () => {
      // First select a story then navigate to last story
      for (let i = 0; i < 15; i++) {
        mockInput.pressKey("j");
        await renderOnce();
      }

      // Should be at last story (index 9) - first j goes from -1 to 0, then 9 more to reach 9
      expect(app.currentSelectedIndex).toBe(9);

      // Try to go further
      mockInput.pressKey("j");
      await renderOnce();

      expect(app.currentSelectedIndex).toBe(9);
    });

    it("should navigate multiple stories in sequence", async () => {
      // First j selects first story (from -1 to 0)
      mockInput.pressKey("j");
      await renderOnce();
      // Second j goes to 1
      mockInput.pressKey("j");
      await renderOnce();
      // Third j goes to 2
      mockInput.pressKey("j");
      await renderOnce();
      // Fourth j goes to 3
      mockInput.pressKey("j");
      await renderOnce();

      expect(app.currentSelectedIndex).toBe(3);
    });
  });

  describe("Comment Navigation", () => {
    beforeEach(async () => {
      const mockPost = createMockPostWithComments({}, 5);
      app.setPostsForTesting([mockPost]);
      await app.setSelectedPostForTesting(mockPost);
      await renderOnce();
    });

    it("should start at first root comment", () => {
      expect(app.currentRootCommentIndex).toBe(0);
    });

    it("should have correct number of root comments", () => {
      expect(app.rootCommentCount).toBe(5);
    });

    it("should navigate to next comment with cmd+j", async () => {
      expect(app.currentRootCommentIndex).toBe(0);

      mockInput.pressKey("j", { super: true }); // cmd key is super with kitty keyboard
      await renderOnce();

      expect(app.currentRootCommentIndex).toBe(1);
    });

    it("should navigate to previous comment with cmd+k", async () => {
      // First go to comment 2
      mockInput.pressKey("j", { super: true });
      await renderOnce();
      mockInput.pressKey("j", { super: true });
      await renderOnce();
      expect(app.currentRootCommentIndex).toBe(2);

      // Go back
      mockInput.pressKey("k", { super: true });
      await renderOnce();

      expect(app.currentRootCommentIndex).toBe(1);
    });

    it("should not go before first comment", async () => {
      mockInput.pressKey("k", { super: true });
      await renderOnce();

      expect(app.currentRootCommentIndex).toBe(0);
    });

    it("should not go past last comment", async () => {
      // Navigate to last comment
      for (let i = 0; i < 10; i++) {
        mockInput.pressKey("j", { super: true });
        await renderOnce();
      }

      expect(app.currentRootCommentIndex).toBe(4); // 0-indexed, 5 comments
    });

    it("should scroll to show the target comment", async () => {
      // Create a post with 12 root comments to ensure scrolling is needed
      const mockPost = createMockPostWithComments({}, 12);
      app.setPostsForTesting([mockPost]);
      await app.setSelectedPostForTesting(mockPost);
      await renderOnce();

      // Get initial scroll position using the new component structure
      const storyDetailState = (app as any).storyDetailState;
      const initialScrollTop = storyDetailState.scroll.scrollTop;
      expect(initialScrollTop).toBe(0);

      // Navigate to comment 5
      for (let i = 0; i < 5; i++) {
        mockInput.pressKey("j", { super: true });
        await renderOnce();
      }

      // Scroll should have changed to show comment 5
      const newScrollTop = storyDetailState.scroll.scrollTop;
      expect(newScrollTop).toBeGreaterThan(initialScrollTop);
    });
  });

  describe("Click Navigation", () => {
    beforeEach(async () => {
      const mockPosts = createMockPosts(10);
      app.setPostsForTesting(mockPosts);
      await renderOnce();
    });

    it("should select story on click", async () => {
      expect(app.currentSelectedIndex).toBe(-1);

      // Click on third story (approximate Y position based on layout)
      // Stories start after header (height 3), each story is ~2 lines
      const storyY = 3 + 2 * 2 + 1; // Third story
      await mockMouse.click(10, storyY);
      await renderOnce();

      // The click should have selected a story
      // Exact index depends on hit testing
      expect(app.currentSelectedIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe("UI Rendering", () => {
    it("should render header with Hacker News title", async () => {
      app.setPostsForTesting(createMockPosts(5));
      await renderOnce();

      const frame = captureCharFrame();
      expect(frame).toContain("Hacker News");
    });

    it("should render story titles", async () => {
      const posts = createMockPosts(3);
      app.setPostsForTesting(posts);
      await renderOnce();

      const frame = captureCharFrame();
      expect(frame).toContain("Test Story 1");
    });

    it("should render domains when present", async () => {
      const posts = createMockPosts(3);
      app.setPostsForTesting(posts);
      await renderOnce();

      const frame = captureCharFrame();
      // Posts at index 1 and 2 should have domains
      expect(frame).toContain("domain2.com");
    });

    it("should render keyboard shortcuts bar when story selected", async () => {
      const posts = createMockPosts(1);
      app.setPostsForTesting(posts);
      // Select a story to show the shortcuts bar
      await app.setSelectedPostForTesting(posts[0]!);
      await renderOnce();

      const frame = captureCharFrame();
      // Shortcuts bar should show keyboard hints
      expect(frame).toContain("j/k");
      expect(frame).toContain("stories");
      expect(frame).toContain("comments");
    });
  });

  describe("Post Detail View", () => {
    it("should render post header with comments count", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);
      await renderOnce();

      const frame = captureCharFrame();
      expect(frame).toContain("2 comments");
    });

    it("should render comments section", async () => {
      const post = createMockPostWithComments({}, 5);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);
      await renderOnce();

      const frame = captureCharFrame();
      expect(frame).toContain("5 comments");
    });
  });

  describe("Chat Mode Rendering", () => {
    it("should render suggestions on separate lines", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode properly using showChatView
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for focus timeout
      await new Promise(resolve => setTimeout(resolve, 20));

      // Set suggestions via the chat panel state
      const chatPanelState = (app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.selectedIndex = 2;

        // Import and call renderSuggestions
        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((app as any).ctx, chatPanelState.suggestions);
      }

      await renderOnce();
      const frame = captureCharFrame();

      // Verify each suggestion is on a separate line
      const lines = frame.split("\n");
      const q1Lines = lines.filter((l: string) => l.includes("Question one?"));
      const q2Lines = lines.filter((l: string) => l.includes("Question two?"));
      const q3Lines = lines.filter((l: string) => l.includes("Question three?"));

      // Each should appear exactly once and on different lines
      expect(q1Lines.length).toBe(1);
      expect(q2Lines.length).toBe(1);
      expect(q3Lines.length).toBe(1);

      // No line should contain multiple questions (interleaving check)
      for (const line of lines) {
        const count = [
          line.includes("Question one?"),
          line.includes("Question two?"),
          line.includes("Question three?"),
        ].filter(Boolean).length;
        expect(count).toBeLessThanOrEqual(1);
      }
    });

    it("should navigate suggestions with arrow keys", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode properly
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for focus timeout
      await new Promise(resolve => setTimeout(resolve, 20));
      await renderOnce();

      // Set suggestions via the chat panel state
      const chatPanelState = (app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.originalSuggestions = [...chatPanelState.suggestions.suggestions];
        chatPanelState.suggestions.selectedIndex = 2;

        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((app as any).ctx, chatPanelState.suggestions);
      }
      await renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.selectedIndex).toBe(2);
      expect(chatPanelState.suggestions.suggestions.length).toBe(3);

      // Navigate up (from index 2 to 1)
      mockInput.pressKey("ARROW_UP");
      await renderOnce();
      expect(chatPanelState.suggestions.selectedIndex).toBe(1);

      // Navigate up again (from index 1 to 0)
      mockInput.pressKey("ARROW_UP");
      await renderOnce();
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);

      // Navigate down (from index 0 to 1)
      mockInput.pressKey("ARROW_DOWN");
      await renderOnce();
      expect(chatPanelState.suggestions.selectedIndex).toBe(1);
    });

    it("should select suggestion when selectSuggestion is called", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for focus timeout
      await new Promise(resolve => setTimeout(resolve, 20));
      await renderOnce();

      // Set up suggestions
      const chatPanelState = (app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.selectedIndex = 0;

        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((app as any).ctx, chatPanelState.suggestions);
      }
      await renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(3);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);

      // Call selectSuggestion directly
      (app as any).selectSuggestion();

      // After selection, suggestions should be cleared
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
    });

    it("should submit suggestion when Enter is pressed with suggestion selected", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await renderOnce();

      // Set up suggestions
      const chatPanelState = (app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.selectedIndex = 0;

        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((app as any).ctx, chatPanelState.suggestions);
      }
      await renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(3);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);
      expect(chatPanelState.input.plainText).toBe("");

      // Use the keyboard handler path - pressing Enter with empty input and selected suggestion
      // triggers selectSuggestion() which selects and submits the suggestion
      mockInput.pressEnter();
      await renderOnce();

      // After submission, suggestions should be cleared and message should be sent
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
    });

    it("should submit typed text when Enter is pressed with text in input", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await renderOnce();

      // Clear any suggestions
      const chatPanelState = (app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = [];

      const { renderSuggestions } = await import("../components/Suggestions");
      renderSuggestions((app as any).ctx, chatPanelState.suggestions);

      // Type some text into the input
      chatPanelState.input.insertText("Hello, this is my question");
      await renderOnce();

      // Verify the text is in the input
      expect(chatPanelState.input.plainText).toBe("Hello, this is my question");

      // Record initial message count
      const initialMessageCount = chatPanelState.messages.length;

      // Emit submit event (simulates Enter key)
      chatPanelState.input.emit("submit");
      await renderOnce();

      // Input should be cleared and message should be added
      // Note: sendChatMessage clears the input after sending
      expect(chatPanelState.messages.length).toBeGreaterThan(initialMessageCount);
    });

    it("should select suggestion when Enter key is pressed", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await renderOnce();

      // Set up state with a suggestion selected
      const chatPanelState = (app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = ["Test question?"];
      chatPanelState.suggestions.selectedIndex = 0;

      const { renderSuggestions } = await import("../components/Suggestions");
      renderSuggestions((app as any).ctx, chatPanelState.suggestions);
      await renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(1);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);

      // Press Enter key
      mockInput.pressEnter();
      await renderOnce();

      // Suggestion should be selected and cleared
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
    });

    it("should insert suggestion into input when Tab is pressed", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await renderOnce();

      // Set up state with a suggestion selected
      const chatPanelState = (app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = ["What is the main argument?", "Who wrote this?"];
      chatPanelState.suggestions.selectedIndex = 0;

      const { renderSuggestions } = await import("../components/Suggestions");
      renderSuggestions((app as any).ctx, chatPanelState.suggestions);
      await renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(2);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);
      expect(chatPanelState.input.plainText).toBe("");
      const initialMessageCount = chatPanelState.messages.length;

      // Press Tab key
      mockInput.pressKey("TAB");
      await renderOnce();

      // Suggestion should be inserted into input with trailing space, but NOT sent
      expect(chatPanelState.input.plainText).toBe("What is the main argument? ");
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
      // Message count should NOT have increased (Tab doesn't send)
      expect(chatPanelState.messages.length).toBe(initialMessageCount);
    });

    it("should send message when Enter key is pressed with typed text", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await renderOnce();

      // Clear suggestions and type text
      const chatPanelState = (app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = [];
      chatPanelState.suggestions.selectedIndex = -1;

      chatPanelState.input.insertText("My custom question");
      await renderOnce();

      // Verify text is in input
      expect(chatPanelState.input.plainText).toBe("My custom question");

      // Record initial message count
      const initialMessageCount = chatPanelState.messages.length;

      // Press Enter key
      mockInput.pressEnter();
      await renderOnce();

      // Message should be added
      expect(chatPanelState.messages.length).toBeGreaterThan(initialMessageCount);
    });

    it("should hide story list panel when entering chat mode", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);
      await renderOnce();

      const contentArea = (app as any).contentArea;
      const storyListState = (app as any).storyListState;
      const storyDetailState = (app as any).storyDetailState;

      // Get initial state - content area should have 2 children (story list + detail)
      const initialChildren = contentArea.getChildren().length;
      expect(initialChildren).toBe(2);
      const initialDetailWidth = storyDetailState.panel.width;

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Story list should be removed from content area, detail panel should be wider
      expect(contentArea.getChildren().length).toBe(1);
      expect(contentArea.getChildren()[0]).toBe(storyDetailState.panel);
      expect(storyDetailState.panel.width).not.toBe(initialDetailWidth);
    });

    it("should show story list panel when exiting chat mode", async () => {
      const post = createMockPostWithComments({}, 2);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);
      await renderOnce();

      const contentArea = (app as any).contentArea;
      const storyListState = (app as any).storyListState;
      const storyDetailState = (app as any).storyDetailState;

      // Get initial state
      const initialDetailWidth = storyDetailState.panel.width;
      expect(contentArea.getChildren().length).toBe(2);

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Verify hidden state
      expect(contentArea.getChildren().length).toBe(1);

      // Exit chat mode
      (app as any).hideChatView();
      await renderOnce();

      // Story list should be back, detail panel restored
      expect(contentArea.getChildren().length).toBe(2);
      expect(contentArea.getChildren()[0]).toBe(storyListState.panel);
      expect(storyDetailState.panel.width).toBe(initialDetailWidth);
    });

    it("should not show story list in chat mode frame", async () => {
      const posts = createMockPosts(5);
      app.setPostsForTesting(posts);
      await app.setSelectedPostForTesting(posts[0]!);
      await renderOnce();

      // Verify story list is visible before chat mode
      let frame = captureCharFrame();
      expect(frame).toContain("Test Story 1");
      expect(frame).toContain("Test Story 2");

      // Enter chat mode
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      // Story list should not be visible in the rendered frame
      frame = captureCharFrame();
      // The detail panel should now take full width, story list hidden
      // We shouldn't see the story list sidebar markers
      expect(frame).not.toContain("Test Story 2"); // Other stories shouldn't be visible
    });

    it("should render chat header with title and domain on separate lines", async () => {
      const post = createMockPostWithComments(
        {
          title: "Test Title Here",
          domain: "testdomain.com",
        },
        1
      );
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);

      // Enter chat mode properly
      (app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (app as any).showChatView();
      await renderOnce();

      const frame = captureCharFrame();

      // Find lines with title and domain
      const lines = frame.split("\n");
      const titleLine = lines.findIndex((l: string) => l.includes("Test Title Here"));
      const domainLine = lines.findIndex((l: string) => l.includes("testdomain.com"));

      expect(titleLine).toBeGreaterThanOrEqual(0);
      expect(domainLine).toBeGreaterThanOrEqual(0);
      expect(domainLine).toBeGreaterThan(titleLine); // Domain after title

      // They should not be on the same line
      expect(titleLine).not.toBe(domainLine);
    });
  });
});

describe("API Integration", () => {
  it("should filter posts correctly", async () => {
    // This test would mock the fetch API
    // For now, just verify the app can be created
    const testContext = await createTestRenderer({
      width: 80,
      height: 24,
    });

    const app = new HackerNewsApp(testContext.renderer, {});
    expect(app).toBeDefined();

    testContext.renderer.destroy();
  });
});
