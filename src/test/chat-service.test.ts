import { describe, it, expect } from "bun:test";
import { buildStoryContext } from "../services/ChatService";
import { createMockPost, createMockPostWithComments } from "./fixtures";

describe("ChatService", () => {
  describe("buildStoryContext", () => {
    it("should build context with story metadata", () => {
      const post = createMockPost({
        title: "Test Story Title",
        url: "https://example.com/story",
        domain: "example.com",
        points: 150,
        user: "testuser",
        comments_count: 42,
      });

      const context = buildStoryContext(post);

      expect(context).toContain("**Title:** Test Story Title");
      expect(context).toContain("**URL:** https://example.com/story");
      expect(context).toContain("**Domain:** example.com");
      expect(context).toContain("**Points:** 150");
      expect(context).toContain("**Posted by:** testuser");
      expect(context).toContain("**Comments:** 42");
    });

    it("should use HN URL when story has no URL", () => {
      const post = createMockPost({
        id: 12345,
        url: "",
        domain: null,
      });

      const context = buildStoryContext(post);

      expect(context).toContain("**URL:** https://news.ycombinator.com/item?id=12345");
    });

    it("should include comments in context", () => {
      const post = createMockPostWithComments({}, 2);

      const context = buildStoryContext(post);

      expect(context).toContain("# Hacker News Discussion");
      expect(context).toContain("**user1:**");
      expect(context).toContain("Root comment 1");
    });
  });
});
