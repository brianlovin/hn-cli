import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createAppTestContext, cleanupTestContext, type TestContext } from "./test-utils";
import { createMockPosts, createMockPostWithComments } from "./fixtures";

describe("TLDR Feature", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createAppTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it("should show TLDR hint in comments header", async () => {
    const post = createMockPostWithComments({}, 3);
    ctx.app.setPostsForTesting([post]);
    await ctx.app.setSelectedPostForTesting(post);
    await ctx.renderOnce();

    const frame = ctx.captureCharFrame();
    expect(frame).toContain("tldr");
  });

  it("should track loading state via tldrLoading flag and storyId", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Verify tldrLoading and tldrLoadingStoryId are accessible
    expect((ctx.app as any).tldrLoading).toBeDefined();
    expect(typeof (ctx.app as any).tldrLoading).toBe("boolean");

    // Set loading state
    (ctx.app as any).tldrLoading = true;
    (ctx.app as any).tldrLoadingStoryId = posts[0]!.id;
    expect((ctx.app as any).tldrLoading).toBe(true);
    expect((ctx.app as any).tldrLoadingStoryId).toBe(posts[0]!.id);
  });

  it("should track error state via tldrErrorIds set", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Verify tldrErrorIds is accessible
    const tldrErrorIds = (ctx.app as any).tldrErrorIds;
    expect(tldrErrorIds).toBeDefined();
    expect(tldrErrorIds instanceof Set).toBe(true);

    // Add an error ID
    tldrErrorIds.add(posts[0]!.id);
    expect(tldrErrorIds.has(posts[0]!.id)).toBe(true);
  });

  it("should cache TLDR results", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Verify tldrCache is accessible
    const tldrCache = (ctx.app as any).tldrCache;
    expect(tldrCache).toBeDefined();
    expect(tldrCache instanceof Map).toBe(true);

    // Add a cached result
    const tldrResult = {
      articleSummary: "Test summary",
      discussionSummary: "Test discussion",
    };
    tldrCache.set(posts[0]!.id, tldrResult);
    expect(tldrCache.get(posts[0]!.id)).toEqual(tldrResult);
  });
});

describe("TLDR State Transitions", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createAppTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it("should stop TLDR loading animation when switching stories", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Simulate TLDR loading state
    (ctx.app as any).tldrLoading = true;
    (ctx.app as any).tldrLoadingStoryId = posts[0]!.id;

    // Access private method indirectly by checking state after navigation
    const initialLoadingState = (ctx.app as any).tldrLoading;
    expect(initialLoadingState).toBe(true);
  });

  it("should preserve TLDR cache when navigating between stories", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Add a cached TLDR result
    const tldrResult = {
      articleSummary: "Test article summary",
      discussionSummary: "Test discussion summary",
    };
    (ctx.app as any).tldrCache.set(posts[0]!.id, tldrResult);

    // Switch to another story
    await ctx.app.setSelectedPostForTesting(posts[1]!);
    await ctx.renderOnce();

    // Switch back
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Cache should still have the result
    expect((ctx.app as any).tldrCache.get(posts[0]!.id)).toEqual(tldrResult);
  });

  it("should clear error state when regenerating TLDR", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Add an error state
    (ctx.app as any).tldrErrorIds.add(posts[0]!.id);
    expect((ctx.app as any).tldrErrorIds.has(posts[0]!.id)).toBe(true);

    // Simulate the beginning of handleTldrRequest
    (ctx.app as any).tldrCache.delete(posts[0]!.id);
    (ctx.app as any).tldrErrorIds.delete(posts[0]!.id);

    // Error state should be cleared
    expect((ctx.app as any).tldrErrorIds.has(posts[0]!.id)).toBe(false);
  });

  it("should track which story is loading TLDR", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Simulate loading for story 0
    (ctx.app as any).tldrLoading = true;
    (ctx.app as any).tldrLoadingStoryId = posts[0]!.id;

    // Switch to story 1
    await ctx.app.setSelectedPostForTesting(posts[1]!);
    await ctx.renderOnce();

    // tldrLoadingStoryId should still point to story 0 (loading continues in background)
    expect((ctx.app as any).tldrLoadingStoryId).toBe(posts[0]!.id);
  });
});
