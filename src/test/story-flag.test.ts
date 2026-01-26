import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createAppTestContext, cleanupTestContext, type TestContext } from "./test-utils";
import { createMockPosts, createMockPost } from "./fixtures";
import {
  showStoryListNotification,
  hideStoryListNotification,
} from "../components/StoryList";

describe("Story Flag Feature", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createAppTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  describe("StoryListNotification", () => {
    beforeEach(async () => {
      const mockPosts = createMockPosts(5);
      ctx.app.setPostsForTesting(mockPosts);
      await ctx.renderOnce();
    });

    it("should show notification message in story list", async () => {
      const storyListState = (ctx.app as any).storyListState;

      showStoryListNotification(storyListState, "Story 12345 not found");
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      expect(frame).toContain("Story 12345 not found");
    });

    it("should hide notification when hideStoryListNotification is called", async () => {
      const storyListState = (ctx.app as any).storyListState;

      // Show then hide
      showStoryListNotification(storyListState, "Story 12345 not found");
      await ctx.renderOnce();

      let frame = ctx.captureCharFrame();
      expect(frame).toContain("Story 12345 not found");

      hideStoryListNotification(storyListState);
      await ctx.renderOnce();

      frame = ctx.captureCharFrame();
      expect(frame).not.toContain("Story 12345 not found");
    });

    it("should still display stories when notification is shown", async () => {
      const storyListState = (ctx.app as any).storyListState;

      showStoryListNotification(storyListState, "Story 99999 not found");
      await ctx.renderOnce();

      const frame = ctx.captureCharFrame();
      // Notification should be visible
      expect(frame).toContain("Story 99999 not found");
      // Stories should still be visible
      expect(frame).toContain("Test Story 1");
      expect(frame).toContain("Test Story 2");
    });
  });

  describe("handleRequestedStory", () => {
    it("should return existing index when story is already in list", async () => {
      const mockPosts = createMockPosts(5);
      ctx.app.setPostsForTesting(mockPosts);
      await ctx.renderOnce();

      // Access the private method via the app instance
      const app = ctx.app as any;
      app.requestedStoryId = mockPosts[2]!.id; // Request the 3rd story (id=3)
      app.posts = mockPosts;

      const result = await app.handleRequestedStory();

      expect(result.index).toBe(2);
      expect(result.found).toBe(true);
    });

    it("should return not found when story is not in list and cannot be fetched", async () => {
      const mockPosts = createMockPosts(5);
      ctx.app.setPostsForTesting(mockPosts);
      await ctx.renderOnce();

      const app = ctx.app as any;
      app.requestedStoryId = 999999999; // Non-existent story ID
      app.posts = mockPosts;

      const result = await app.handleRequestedStory();

      // Story not found, should return index 0 and found=false
      expect(result.index).toBe(0);
      expect(result.found).toBe(false);
    });

    it("should return default values when no story ID is requested", async () => {
      const mockPosts = createMockPosts(5);
      ctx.app.setPostsForTesting(mockPosts);
      await ctx.renderOnce();

      const app = ctx.app as any;
      app.requestedStoryId = undefined;
      app.posts = mockPosts;

      const result = await app.handleRequestedStory();

      expect(result.index).toBe(0);
      expect(result.found).toBe(true);
    });
  });
});
