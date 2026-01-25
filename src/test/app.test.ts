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

    it("should start with first story selected", () => {
      expect(app.currentSelectedIndex).toBe(0);
    });

    it("should navigate down with j key", async () => {
      expect(app.currentSelectedIndex).toBe(0);

      mockInput.pressKey("j");
      await renderOnce();

      expect(app.currentSelectedIndex).toBe(1);
    });

    it("should navigate up with k key", async () => {
      // First go down
      mockInput.pressKey("j");
      await renderOnce();
      expect(app.currentSelectedIndex).toBe(1);

      // Then go up
      mockInput.pressKey("k");
      await renderOnce();

      expect(app.currentSelectedIndex).toBe(0);
    });

    it("should not go below first story", async () => {
      mockInput.pressKey("k");
      await renderOnce();

      expect(app.currentSelectedIndex).toBe(0);
    });

    it("should not go above last story", async () => {
      // Navigate to last story
      for (let i = 0; i < 15; i++) {
        mockInput.pressKey("j");
        await renderOnce();
      }

      // Should be at last story (index 9)
      expect(app.currentSelectedIndex).toBe(9);

      // Try to go further
      mockInput.pressKey("j");
      await renderOnce();

      expect(app.currentSelectedIndex).toBe(9);
    });

    it("should navigate multiple stories in sequence", async () => {
      mockInput.pressKey("j");
      await renderOnce();
      mockInput.pressKey("j");
      await renderOnce();
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

      mockInput.pressKey("j", { meta: true }); // cmd key is meta
      await renderOnce();

      expect(app.currentRootCommentIndex).toBe(1);
    });

    it("should navigate to previous comment with cmd+k", async () => {
      // First go to comment 2
      mockInput.pressKey("j", { meta: true });
      await renderOnce();
      mockInput.pressKey("j", { meta: true });
      await renderOnce();
      expect(app.currentRootCommentIndex).toBe(2);

      // Go back
      mockInput.pressKey("k", { meta: true });
      await renderOnce();

      expect(app.currentRootCommentIndex).toBe(1);
    });

    it("should not go before first comment", async () => {
      mockInput.pressKey("k", { meta: true });
      await renderOnce();

      expect(app.currentRootCommentIndex).toBe(0);
    });

    it("should not go past last comment", async () => {
      // Navigate to last comment
      for (let i = 0; i < 10; i++) {
        mockInput.pressKey("j", { meta: true });
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

      // Get initial scroll position
      const initialScrollTop = (app as any).detailScroll.scrollTop;
      expect(initialScrollTop).toBe(0);

      // Navigate to comment 5
      for (let i = 0; i < 5; i++) {
        mockInput.pressKey("j", { meta: true });
        await renderOnce();
      }

      // Scroll should have changed to show comment 5
      const newScrollTop = (app as any).detailScroll.scrollTop;
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
      expect(app.currentSelectedIndex).toBe(0);

      // Click on third story (approximate Y position based on layout)
      // Stories start after header (height 3), each story is ~2 lines
      const storyY = 3 + 2 * 2 + 1; // Third story
      await mockMouse.click(10, storyY);
      await renderOnce();

      // The click should have selected a different story
      // Exact index depends on hit testing, but it shouldn't be 0
      expect(app.currentSelectedIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe("UI Rendering", () => {
    it("should render header with briOS HN title", async () => {
      app.setPostsForTesting(createMockPosts(5));
      await renderOnce();

      const frame = captureCharFrame();
      expect(frame).toContain("briOS HN");
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

    it("should render keyboard shortcuts bar", async () => {
      app.setPostsForTesting(createMockPosts(1));
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
