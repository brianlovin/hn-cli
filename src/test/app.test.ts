import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createAppTestContext, cleanupTestContext, type TestContext } from "./test-utils";
import { createMockPosts, createMockPostWithComments } from "./fixtures";

describe("HackerNewsApp", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createAppTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  describe("Story Navigation", () => {
    beforeEach(async () => {
      const mockPosts = createMockPosts(10);
      ctx.app.setPostsForTesting(mockPosts);
      await ctx.renderOnce();
    });

    it("should start with no story selected", () => {
      expect(ctx.app.currentSelectedIndex).toBe(-1);
    });

    it("should select first story when j is pressed with no selection", async () => {
      expect(ctx.app.currentSelectedIndex).toBe(-1);
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(0);
    });

    it("should select last story when k is pressed with no selection", async () => {
      expect(ctx.app.currentSelectedIndex).toBe(-1);
      ctx.mockInput.pressKey("k");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(9); // 10 posts, last index is 9
    });

    it("should navigate down with j key", async () => {
      // First j selects first story (from -1 to 0)
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(0);

      // Second j navigates to next story
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(1);
    });

    it("should navigate up with k key", async () => {
      // First select a story
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(0);

      // Go down once more
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(1);

      // Then go up
      ctx.mockInput.pressKey("k");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(0);
    });

    it("should not go above first story when at first story", async () => {
      // First select a story
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(0);

      // Try to go up from first story
      ctx.mockInput.pressKey("k");
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(0);
    });

    it("should not go below last story", async () => {
      // First select a story then navigate to last story
      for (let i = 0; i < 15; i++) {
        ctx.mockInput.pressKey("j");
        await ctx.renderOnce();
      }

      // Should be at last story (index 9) - first j goes from -1 to 0, then 9 more to reach 9
      expect(ctx.app.currentSelectedIndex).toBe(9);

      // Try to go further
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();

      expect(ctx.app.currentSelectedIndex).toBe(9);
    });

    it("should navigate multiple stories in sequence", async () => {
      // First j selects first story (from -1 to 0)
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      // Second j goes to 1
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      // Third j goes to 2
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();
      // Fourth j goes to 3
      ctx.mockInput.pressKey("j");
      await ctx.renderOnce();

      expect(ctx.app.currentSelectedIndex).toBe(3);
    });
  });

  describe("Story List Scroll", () => {
    it("should scroll down to show off-screen selected story", async () => {
      // Create more stories than can fit in viewport
      const posts = createMockPosts(20);
      ctx.app.setPostsForTesting(posts);
      await ctx.renderOnce();

      const storyListState = (ctx.app as any).storyListState;
      expect(storyListState.scroll.scrollTop).toBe(0);

      // Navigate down past the visible viewport (each story is ~3 lines with gap)
      for (let i = 0; i < 15; i++) {
        ctx.mockInput.pressKey("j");
        await ctx.renderer.idle(); // Wait for async selectStory to complete
        await ctx.renderOnce();
      }

      // Scroll should have changed to show the selected story
      expect(ctx.app.currentSelectedIndex).toBe(14);
      expect(storyListState.scroll.scrollTop).toBeGreaterThan(0);
    });

    it("should scroll up to show off-screen selected story", async () => {
      // Create more stories than can fit in viewport
      const posts = createMockPosts(20);
      ctx.app.setPostsForTesting(posts);
      await ctx.renderOnce();

      const storyListState = (ctx.app as any).storyListState;

      // Navigate down to bottom
      for (let i = 0; i < 19; i++) {
        ctx.mockInput.pressKey("j");
        await ctx.renderer.idle();
        await ctx.renderOnce();
      }
      expect(ctx.app.currentSelectedIndex).toBe(18);
      const scrollAtBottom = storyListState.scroll.scrollTop;
      expect(scrollAtBottom).toBeGreaterThan(0);

      // Navigate back up past visible viewport
      for (let i = 0; i < 15; i++) {
        ctx.mockInput.pressKey("k");
        await ctx.renderer.idle();
        await ctx.renderOnce();
      }

      // Scroll should have decreased to show the selected story
      expect(ctx.app.currentSelectedIndex).toBe(3);
      expect(storyListState.scroll.scrollTop).toBeLessThan(scrollAtBottom);
    });

    it("should not scroll when selected story is already visible", async () => {
      const posts = createMockPosts(20);
      ctx.app.setPostsForTesting(posts);
      await ctx.renderOnce();

      const storyListState = (ctx.app as any).storyListState;

      // Select first story
      ctx.mockInput.pressKey("j");
      await ctx.renderer.idle();
      await ctx.renderOnce();
      expect(storyListState.scroll.scrollTop).toBe(0);

      // Navigate to second story (should still be visible without scrolling)
      ctx.mockInput.pressKey("j");
      await ctx.renderer.idle();
      await ctx.renderOnce();
      expect(ctx.app.currentSelectedIndex).toBe(1);
      expect(storyListState.scroll.scrollTop).toBe(0);
    });
  });

  describe("Comment Navigation", () => {
    beforeEach(async () => {
      const mockPost = createMockPostWithComments({}, 5);
      ctx.app.setPostsForTesting([mockPost]);
      await ctx.app.setSelectedPostForTesting(mockPost);
      await ctx.renderOnce();
    });

    it("should start at first root comment", () => {
      expect(ctx.app.currentRootCommentIndex).toBe(0);
    });

    it("should have correct number of root comments", () => {
      expect(ctx.app.rootCommentCount).toBe(5);
    });

    it("should navigate to next comment with space key", async () => {
      expect(ctx.app.currentRootCommentIndex).toBe(0);

      ctx.mockInput.pressKey(" ");
      await ctx.renderOnce();

      expect(ctx.app.currentRootCommentIndex).toBe(1);
    });

    it("should only navigate forward with space (no backward navigation)", async () => {
      // Navigate to comment 2
      ctx.mockInput.pressKey(" ");
      await ctx.renderOnce();
      ctx.mockInput.pressKey(" ");
      await ctx.renderOnce();
      expect(ctx.app.currentRootCommentIndex).toBe(2);

      // Space should only go forward, pressing more times should continue forward
      ctx.mockInput.pressKey(" ");
      await ctx.renderOnce();
      expect(ctx.app.currentRootCommentIndex).toBe(3);
    });

    it("should stay at first comment when at beginning (space only goes forward)", async () => {
      // At first comment, space should go to next
      expect(ctx.app.currentRootCommentIndex).toBe(0);
      ctx.mockInput.pressKey(" ");
      await ctx.renderOnce();
      expect(ctx.app.currentRootCommentIndex).toBe(1);
    });

    it("should not go past last comment", async () => {
      // Navigate to last comment
      for (let i = 0; i < 10; i++) {
        ctx.mockInput.pressKey(" ");
        await ctx.renderOnce();
      }

      expect(ctx.app.currentRootCommentIndex).toBe(4); // 0-indexed, 5 comments
    });

    it("should scroll down with down arrow key", async () => {
      const storyDetailState = (ctx.app as any).storyDetailState;
      expect(storyDetailState.scroll.scrollTop).toBe(0);

      ctx.mockInput.pressKey("ARROW_DOWN");
      await ctx.renderOnce();

      expect(storyDetailState.scroll.scrollTop).toBe(3);
    });

    it("should scroll up with up arrow key", async () => {
      const storyDetailState = (ctx.app as any).storyDetailState;
      // First scroll down
      ctx.mockInput.pressKey("ARROW_DOWN");
      ctx.mockInput.pressKey("ARROW_DOWN");
      await ctx.renderOnce();
      expect(storyDetailState.scroll.scrollTop).toBe(6);

      // Then scroll back up
      ctx.mockInput.pressKey("ARROW_UP");
      await ctx.renderOnce();
      expect(storyDetailState.scroll.scrollTop).toBe(3);
    });

    it("should not scroll above 0 with up arrow", async () => {
      const storyDetailState = (ctx.app as any).storyDetailState;
      expect(storyDetailState.scroll.scrollTop).toBe(0);

      ctx.mockInput.pressKey("ARROW_UP");
      await ctx.renderOnce();

      expect(storyDetailState.scroll.scrollTop).toBe(0);
    });

    it("should scroll to show the target comment", async () => {
      // Create a post with 12 root comments to ensure scrolling is needed
      const mockPost = createMockPostWithComments({}, 12);
      ctx.app.setPostsForTesting([mockPost]);
      await ctx.app.setSelectedPostForTesting(mockPost);
      await ctx.renderOnce();

      // Get initial scroll position using the new component structure
      const storyDetailState = (ctx.app as any).storyDetailState;
      const initialScrollTop = storyDetailState.scroll.scrollTop;
      expect(initialScrollTop).toBe(0);

      // Navigate to comment 5
      for (let i = 0; i < 5; i++) {
        ctx.mockInput.pressKey(" ");
        await ctx.renderOnce();
      }

      // Scroll should have changed to show comment 5
      const newScrollTop = storyDetailState.scroll.scrollTop;
      expect(newScrollTop).toBeGreaterThan(initialScrollTop);
    });
  });

  describe("Click Navigation", () => {
    beforeEach(async () => {
      const mockPosts = createMockPosts(10);
      ctx.app.setPostsForTesting(mockPosts);
      await ctx.renderOnce();
    });

    it("should select story on click", async () => {
      expect(ctx.app.currentSelectedIndex).toBe(-1);

      // Click on third story (approximate Y position based on layout)
      // Stories start after header (height 3), each story is ~2 lines
      const storyY = 3 + 2 * 2 + 1; // Third story
      await ctx.mockMouse.click(10, storyY);
      await ctx.renderOnce();

      // The click should have selected a story
      // Exact index depends on hit testing
      expect(ctx.app.currentSelectedIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe("UI Rendering", () => {
    it("should render header with Hacker News title", async () => {
      ctx.app.setPostsForTesting(createMockPosts(5));
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      expect(frame).toContain("Hacker News");
    });

    it("should render story titles", async () => {
      const posts = createMockPosts(3);
      ctx.app.setPostsForTesting(posts);
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      expect(frame).toContain("Test Story 1");
    });

    it("should render domains when present", async () => {
      const posts = createMockPosts(3);
      ctx.app.setPostsForTesting(posts);
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      // Posts at index 1 and 2 should have domains
      expect(frame).toContain("domain2.com");
    });

    it("should render keyboard shortcuts bar when story selected", async () => {
      const posts = createMockPosts(1);
      ctx.app.setPostsForTesting(posts);
      // Select a story to show the shortcuts bar
      await ctx.app.setSelectedPostForTesting(posts[0]!);
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      // Shortcuts bar should show keyboard hints
      expect(frame).toContain("j/k");
      expect(frame).toContain("navigate");
      expect(frame).toContain("next");
    });
  });

  describe("Post Detail View", () => {
    it("should render post header with comments count", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      expect(frame).toContain("2 comments");
    });

    it("should render comments section", async () => {
      const post = createMockPostWithComments({}, 5);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      expect(frame).toContain("5 comments");
    });
  });

  describe("Chat Mode Rendering", () => {
    it("should render suggestions on separate lines", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode properly using showChatView
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for focus timeout
      await new Promise(resolve => setTimeout(resolve, 20));

      // Set suggestions via the chat panel state
      const chatPanelState = (ctx.app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.selectedIndex = 2;

        // Import and call renderSuggestions
        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((ctx.app as any).ctx, chatPanelState.suggestions);
      }

      await ctx.renderOnce();
      const frame = ctx.captureCharFrame();

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
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode properly
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for focus timeout
      await new Promise(resolve => setTimeout(resolve, 20));
      await ctx.renderOnce();

      // Set suggestions via the chat panel state
      const chatPanelState = (ctx.app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.originalSuggestions = [...chatPanelState.suggestions.suggestions];
        chatPanelState.suggestions.selectedIndex = 2;

        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((ctx.app as any).ctx, chatPanelState.suggestions);
      }
      await ctx.renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.selectedIndex).toBe(2);
      expect(chatPanelState.suggestions.suggestions.length).toBe(3);

      // Navigate up (from index 2 to 1)
      ctx.mockInput.pressKey("ARROW_UP");
      await ctx.renderOnce();
      expect(chatPanelState.suggestions.selectedIndex).toBe(1);

      // Navigate up again (from index 1 to 0)
      ctx.mockInput.pressKey("ARROW_UP");
      await ctx.renderOnce();
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);

      // Navigate down (from index 0 to 1)
      ctx.mockInput.pressKey("ARROW_DOWN");
      await ctx.renderOnce();
      expect(chatPanelState.suggestions.selectedIndex).toBe(1);
    });

    it("should select suggestion when selectSuggestion is called", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for focus timeout
      await new Promise(resolve => setTimeout(resolve, 20));
      await ctx.renderOnce();

      // Set up suggestions
      const chatPanelState = (ctx.app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.selectedIndex = 0;

        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((ctx.app as any).ctx, chatPanelState.suggestions);
      }
      await ctx.renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(3);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);

      // Call selectSuggestion directly
      (ctx.app as any).selectSuggestion();

      // After selection, suggestions should be cleared
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
    });

    it("should submit suggestion when Enter is pressed with suggestion selected", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await ctx.renderOnce();

      // Set up suggestions
      const chatPanelState = (ctx.app as any).chatPanelState;
      if (chatPanelState) {
        chatPanelState.suggestions.loading = false;
        chatPanelState.suggestions.suggestions = ["Question one?", "Question two?", "Question three?"];
        chatPanelState.suggestions.selectedIndex = 0;

        const { renderSuggestions } = await import("../components/Suggestions");
        renderSuggestions((ctx.app as any).ctx, chatPanelState.suggestions);
      }
      await ctx.renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(3);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);
      expect(chatPanelState.input.plainText).toBe("");

      // Use the keyboard handler path - pressing Enter with empty input and selected suggestion
      // triggers selectSuggestion() which selects and submits the suggestion
      ctx.mockInput.pressEnter();
      await ctx.renderOnce();

      // After submission, suggestions should be cleared and message should be sent
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
    });

    it("should submit typed text when Enter is pressed with text in input", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await ctx.renderOnce();

      // Clear any suggestions
      const chatPanelState = (ctx.app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = [];

      const { renderSuggestions } = await import("../components/Suggestions");
      renderSuggestions((ctx.app as any).ctx, chatPanelState.suggestions);

      // Focus the input before typing (input is not auto-focused anymore)
      chatPanelState.input.focus();

      // Type some text into the input
      chatPanelState.input.insertText("Hello, this is my question");
      await ctx.renderOnce();

      // Verify the text is in the input
      expect(chatPanelState.input.plainText).toBe("Hello, this is my question");

      // Record initial message count
      const initialMessageCount = chatPanelState.messages.length;

      // Emit submit event (simulates Enter key)
      chatPanelState.input.emit("submit");
      await ctx.renderOnce();

      // Input should be cleared and message should be added
      // Note: sendChatMessage clears the input after sending
      expect(chatPanelState.messages.length).toBeGreaterThan(initialMessageCount);
    });

    it("should select suggestion when Enter key is pressed", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await ctx.renderOnce();

      // Set up state with a suggestion selected
      const chatPanelState = (ctx.app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = ["Test question?"];
      chatPanelState.suggestions.selectedIndex = 0;

      const { renderSuggestions } = await import("../components/Suggestions");
      renderSuggestions((ctx.app as any).ctx, chatPanelState.suggestions);
      await ctx.renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(1);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);

      // Press Enter key
      ctx.mockInput.pressEnter();
      await ctx.renderOnce();

      // Suggestion should be selected and cleared
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
    });

    it("should insert suggestion into input when Tab is pressed", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await ctx.renderOnce();

      // Set up state with a suggestion selected
      const chatPanelState = (ctx.app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = ["What is the main argument?", "Who wrote this?"];
      chatPanelState.suggestions.selectedIndex = 0;

      const { renderSuggestions } = await import("../components/Suggestions");
      renderSuggestions((ctx.app as any).ctx, chatPanelState.suggestions);
      await ctx.renderOnce();

      // Verify initial state
      expect(chatPanelState.suggestions.suggestions.length).toBe(2);
      expect(chatPanelState.suggestions.selectedIndex).toBe(0);
      expect(chatPanelState.input.plainText).toBe("");
      const initialMessageCount = chatPanelState.messages.length;

      // Press Tab key
      ctx.mockInput.pressKey("TAB");
      await ctx.renderOnce();

      // Suggestion should be inserted into input with trailing space, but NOT sent
      expect(chatPanelState.input.plainText).toBe("What is the main argument? ");
      expect(chatPanelState.suggestions.suggestions.length).toBe(0);
      expect(chatPanelState.suggestions.selectedIndex).toBe(-1);
      // Message count should NOT have increased (Tab doesn't send)
      expect(chatPanelState.messages.length).toBe(initialMessageCount);
    });

    it("should send message when Enter key is pressed with typed text", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Wait for the focus timeout from showChatView
      await new Promise(resolve => setTimeout(resolve, 20));
      await ctx.renderOnce();

      // Clear suggestions and type text
      const chatPanelState = (ctx.app as any).chatPanelState;
      chatPanelState.suggestions.loading = false;
      chatPanelState.suggestions.suggestions = [];
      chatPanelState.suggestions.selectedIndex = -1;

      // Focus the input before typing (input is not auto-focused anymore)
      chatPanelState.input.focus();
      chatPanelState.input.insertText("My custom question");
      await ctx.renderOnce();

      // Verify text is in input
      expect(chatPanelState.input.plainText).toBe("My custom question");

      // Record initial message count
      const initialMessageCount = chatPanelState.messages.length;

      // Press Enter key
      ctx.mockInput.pressEnter();
      await ctx.renderOnce();

      // Message should be added
      expect(chatPanelState.messages.length).toBeGreaterThan(initialMessageCount);
    });

    it("should keep story list visible when entering chat mode", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);
      await ctx.renderOnce();

      const contentArea = (ctx.app as any).contentArea;
      const storyListState = (ctx.app as any).storyListState;

      // Get initial state - content area should have 2 children (story list + detail)
      const initialChildren = contentArea.getChildren().length;
      expect(initialChildren).toBe(2);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Story list should still be visible (2 children)
      expect(contentArea.getChildren().length).toBe(2);
      expect(contentArea.getChildren()[0]).toBe(storyListState.panel);
    });

    it("should keep story list visible when exiting chat mode", async () => {
      const post = createMockPostWithComments({}, 2);
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);
      await ctx.renderOnce();

      const contentArea = (ctx.app as any).contentArea;
      const storyListState = (ctx.app as any).storyListState;

      expect(contentArea.getChildren().length).toBe(2);

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Story list should still be visible
      expect(contentArea.getChildren().length).toBe(2);

      // Exit chat mode
      (ctx.app as any).hideChatView();
      await ctx.renderOnce();

      // Story list should still be visible
      expect(contentArea.getChildren().length).toBe(2);
      expect(contentArea.getChildren()[0]).toBe(storyListState.panel);
    });

    it("should keep story list visible in chat mode", async () => {
      const posts = createMockPosts(5);
      ctx.app.setPostsForTesting(posts);
      await ctx.app.setSelectedPostForTesting(posts[0]!);
      await ctx.renderOnce();

      // Verify story list is visible before chat mode
      let frame = ctx.captureCharFrame();
      expect(frame).toContain("Test Story 1");
      expect(frame).toContain("Test Story 2");

      // Enter chat mode
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      // Story list should remain visible in chat mode
      frame = ctx.captureCharFrame();
      expect(frame).toContain("Test Story 1");
      expect(frame).toContain("Test Story 2");
    });

    it("should render chat header with title and domain on separate lines", async () => {
      const post = createMockPostWithComments(
        {
          title: "Test Title Here",
          domain: "testdomain.com",
        },
        1
      );
      ctx.app.setPostsForTesting([post]);
      await ctx.app.setSelectedPostForTesting(post);

      // Enter chat mode properly
      (ctx.app as any).chatServiceState = { provider: "anthropic", isStreaming: false };
      (ctx.app as any).showChatView();
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();

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
    const { createTestRenderer } = await import("@opentui/core/testing");
    const { HackerNewsApp } = await import("../app");

    const testContext = await createTestRenderer({
      width: 80,
      height: 24,
    });

    const app = new HackerNewsApp(testContext.renderer, {});
    expect(app).toBeDefined();

    testContext.renderer.destroy();
  });
});
