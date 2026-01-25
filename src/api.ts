import type { HackerNewsComment, HackerNewsPost } from "./types";

const TOP_BASE_URL = "https://hacker-news.firebaseio.com/v0";
const ITEM_BASE_URL = "https://api.hnpwa.com/v0";

// Constants matching briOS implementation
const MAX_ROOT_COMMENTS = 12;
const MAX_CHILD_COMMENTS = 8;
const MAX_COMMENT_LEVEL = 3;
const MAX_POSTS = 24;

export async function getTopStoryIds(): Promise<number[]> {
  const response = await fetch(`${TOP_BASE_URL}/topstories.json`);
  if (!response.ok) throw new Error("Failed to fetch top stories");
  return response.json() as Promise<number[]>;
}

function trimComments(comment: HackerNewsComment): HackerNewsComment | null {
  if (!comment) return null;

  // Exclude comments deeper than level 3
  if (comment.level > MAX_COMMENT_LEVEL) {
    return null;
  }

  return {
    ...comment,
    // Max 8 child comments per parent
    comments: comment.comments
      .slice(0, MAX_CHILD_COMMENTS)
      .map(trimComments)
      .filter(Boolean) as HackerNewsComment[],
  };
}

function processPost(data: HackerNewsPost, includeComments: boolean): HackerNewsPost {
  // Max 12 root comments
  const shortComments = data.comments
    .slice(0, MAX_ROOT_COMMENTS)
    .map(trimComments)
    .filter(Boolean) as HackerNewsComment[];

  return {
    ...data,
    comments: includeComments ? shortComments : [],
  };
}

export async function getPostById(id: number | string): Promise<HackerNewsPost | null> {
  try {
    const response = await fetch(`${ITEM_BASE_URL}/item/${id}.json`);
    if (!response.ok) return null;
    const data = (await response.json()) as HackerNewsPost;
    return processPost(data, true);
  } catch {
    return null;
  }
}

export async function getRankedPosts(): Promise<HackerNewsPost[]> {
  const topPostIds = await getTopStoryIds();

  // Fetch 200 most recent posts (by ID, higher = newer)
  const filtered = topPostIds.sort((a, b) => b - a).slice(0, 200);

  const posts = await Promise.all(
    filtered.map(async (id) => {
      try {
        const response = await fetch(`${ITEM_BASE_URL}/item/${id}.json`);
        if (!response.ok) return null;
        const data = (await response.json()) as HackerNewsPost;
        return processPost(data, false);
      } catch {
        return null;
      }
    })
  );

  const now = Date.now() / 1000;
  const oneDayAgo = now - 60 * 60 * 24;

  // Filter out null posts
  const validPosts = posts.filter((post): post is HackerNewsPost => post !== null);

  // Only show links (exclude jobs, polls)
  const links = validPosts.filter((post) => post.type === "link");

  // Only show posts from last 24 hours
  const withinLastDay = links.filter((post) => post.time > oneDayAgo);

  // Filter by minimum engagement (50+ points OR 20+ comments)
  const highEngagement = withinLastDay.filter(
    (post) => (post.points || 0) >= 50 || post.comments_count >= 20
  );

  // Sort by weighted score: points + (comments * 0.75) + recency bonus
  const sorted = highEngagement.sort((a, b) => {
    const hoursOldA = (now - a.time) / 3600;
    const hoursOldB = (now - b.time) / 3600;

    // Recency bonus: newer posts get higher scores (decays from 100 to 0 over 24 hours)
    const recencyBonusA = Math.max(0, 100 * (1 - hoursOldA / 24));
    const recencyBonusB = Math.max(0, 100 * (1 - hoursOldB / 24));

    const scoreA = (a.points || 0) + a.comments_count * 0.75 + recencyBonusA;
    const scoreB = (b.points || 0) + b.comments_count * 0.75 + recencyBonusB;

    return scoreB - scoreA;
  });

  return sorted.slice(0, MAX_POSTS);
}
