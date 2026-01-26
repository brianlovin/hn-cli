import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createAppTestContext, cleanupTestContext, type TestContext } from "./test-utils";
import { createMockPosts } from "./fixtures";

describe("AI Indicator State", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createAppTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  it("should track multiple active AI indicators", async () => {
    const posts = createMockPosts(5);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Access the aiActiveIndices set
    const aiActiveIndices = (ctx.app as any).aiActiveIndices as Set<number>;

    // Initially empty
    expect(aiActiveIndices.size).toBe(0);

    // Simulate starting AI activity on multiple stories
    aiActiveIndices.add(0);
    aiActiveIndices.add(2);

    expect(aiActiveIndices.size).toBe(2);
    expect(aiActiveIndices.has(0)).toBe(true);
    expect(aiActiveIndices.has(2)).toBe(true);
    expect(aiActiveIndices.has(1)).toBe(false);
  });

  it("should cleanup AI indicators when app is destroyed", async () => {
    const posts = createMockPosts(3);
    ctx.app.setPostsForTesting(posts);
    await ctx.app.setSelectedPostForTesting(posts[0]!);
    await ctx.renderOnce();

    // Start some intervals
    (ctx.app as any).aiActiveIndices.add(0);
    (ctx.app as any).aiIndicatorInterval = setInterval(() => {}, 100);
    (ctx.app as any).tldrLoadingInterval = setInterval(() => {}, 100);

    // Cleanup should clear intervals
    ctx.app.cleanup();

    expect((ctx.app as any).aiIndicatorInterval).toBeNull();
    expect((ctx.app as any).tldrLoadingInterval).toBeNull();
  });
});
