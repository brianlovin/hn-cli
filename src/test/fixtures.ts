import type { HackerNewsPost, HackerNewsComment } from "../types";

export function createMockComment(overrides: Partial<HackerNewsComment> = {}): HackerNewsComment {
  return {
    id: Math.floor(Math.random() * 1000000),
    user: "testuser",
    content: "<p>This is a test comment</p>",
    level: 0,
    comments: [],
    time_ago: "1 hour ago",
    ...overrides,
  };
}

export function createMockPost(overrides: Partial<HackerNewsPost> = {}): HackerNewsPost {
  const id = overrides.id || Math.floor(Math.random() * 1000000);
  return {
    id,
    title: `Test Post ${id}`,
    points: 100,
    user: "testuser",
    time: Date.now() / 1000 - 3600, // 1 hour ago
    time_ago: "1 hour ago",
    type: "link",
    content: null,
    url: `https://example.com/post/${id}`,
    domain: "example.com",
    comments: [],
    comments_count: 0,
    ...overrides,
  };
}

export function createMockPostWithComments(
  postOverrides: Partial<HackerNewsPost> = {},
  commentCount: number = 5
): HackerNewsPost {
  const comments: HackerNewsComment[] = [];

  for (let i = 0; i < commentCount; i++) {
    const rootComment = createMockComment({
      id: i + 1,
      user: `user${i + 1}`,
      content: `<p>Root comment ${i + 1}</p>`,
      level: 0,
      comments: [
        createMockComment({
          id: (i + 1) * 100 + 1,
          user: `replier${i + 1}`,
          content: `<p>Reply to comment ${i + 1}</p>`,
          level: 1,
          comments: [
            createMockComment({
              id: (i + 1) * 100 + 2,
              user: `deep_replier${i + 1}`,
              content: `<p>Deep reply ${i + 1}</p>`,
              level: 2,
              comments: [],
            }),
          ],
        }),
      ],
    });
    comments.push(rootComment);
  }

  return createMockPost({
    comments,
    comments_count: comments.length,
    ...postOverrides,
  });
}

export function createMockPosts(count: number = 10): HackerNewsPost[] {
  return Array.from({ length: count }, (_, i) =>
    createMockPost({
      id: i + 1,
      title: `Test Story ${i + 1}: A Very Interesting Headline`,
      domain: i % 3 === 0 ? null : `domain${i + 1}.com`,
      points: 100 - i * 5,
    })
  );
}
