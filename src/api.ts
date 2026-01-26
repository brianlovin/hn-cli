import type { HackerNewsComment, HackerNewsPost } from "./types";
import { loadSettings, type FilterSettings } from "./settings";

const TOP_BASE_URL = "https://hacker-news.firebaseio.com/v0";
const ITEM_BASE_URL = "https://api.hnpwa.com/v0";

export async function getTopStoryIds(): Promise<number[]> {
  const response = await fetch(`${TOP_BASE_URL}/topstories.json`);
  if (!response.ok) throw new Error("Failed to fetch top stories");
  return response.json() as Promise<number[]>;
}

function trimComments(
  comment: HackerNewsComment,
  settings: FilterSettings
): HackerNewsComment | null {
  if (!comment) return null;

  // Exclude comments deeper than max level
  if (comment.level > settings.maxCommentLevel) {
    return null;
  }

  return {
    ...comment,
    // Limit child comments per parent
    comments: comment.comments
      .slice(0, settings.maxChildComments)
      .map((c) => trimComments(c, settings))
      .filter(Boolean) as HackerNewsComment[],
  };
}

function processPost(
  data: HackerNewsPost,
  includeComments: boolean,
  settings: FilterSettings
): HackerNewsPost {
  // Limit root comments
  const shortComments = data.comments
    .slice(0, settings.maxRootComments)
    .map((c) => trimComments(c, settings))
    .filter(Boolean) as HackerNewsComment[];

  return {
    ...data,
    comments: includeComments ? shortComments : [],
  };
}

export async function getPostById(
  id: number | string,
  settings?: FilterSettings
): Promise<HackerNewsPost | null> {
  const effectiveSettings = settings ?? loadSettings();
  try {
    const response = await fetch(`${ITEM_BASE_URL}/item/${id}.json`);
    if (!response.ok) return null;
    const data = (await response.json()) as HackerNewsPost;
    return processPost(data, true, effectiveSettings);
  } catch {
    return null;
  }
}

export async function getRankedPosts(settings?: FilterSettings): Promise<HackerNewsPost[]> {
  const effectiveSettings = settings ?? loadSettings();
  const topPostIds = await getTopStoryIds();

  // Fetch most recent posts (by ID, higher = newer)
  const filtered = topPostIds.sort((a, b) => b - a).slice(0, effectiveSettings.fetchLimit);

  const posts = await Promise.all(
    filtered.map(async (id) => {
      try {
        const response = await fetch(`${ITEM_BASE_URL}/item/${id}.json`);
        if (!response.ok) return null;
        const data = (await response.json()) as HackerNewsPost;
        return processPost(data, false, effectiveSettings);
      } catch {
        return null;
      }
    })
  );

  const now = Date.now() / 1000;
  const windowAgo = now - 60 * 60 * effectiveSettings.hoursWindow;

  // Filter out null posts
  const validPosts = posts.filter((post): post is HackerNewsPost => post !== null);

  // Only show links (exclude jobs, polls)
  const links = validPosts.filter((post) => post.type === "link");

  // Only show posts within time window
  const withinWindow = links.filter((post) => post.time > windowAgo);

  // Filter by minimum engagement (minPoints+ points OR minComments+ comments)
  const highEngagement = withinWindow.filter(
    (post) =>
      (post.points || 0) >= effectiveSettings.minPoints ||
      post.comments_count >= effectiveSettings.minComments
  );

  // Sort by weighted score: points + (comments * commentWeight) + recency bonus
  const sorted = highEngagement.sort((a, b) => {
    const hoursOldA = (now - a.time) / 3600;
    const hoursOldB = (now - b.time) / 3600;

    // Recency bonus: newer posts get higher scores (decays over the time window)
    const recencyBonusA = Math.max(
      0,
      effectiveSettings.recencyBonusMax * (1 - hoursOldA / effectiveSettings.hoursWindow)
    );
    const recencyBonusB = Math.max(
      0,
      effectiveSettings.recencyBonusMax * (1 - hoursOldB / effectiveSettings.hoursWindow)
    );

    const scoreA =
      (a.points || 0) + a.comments_count * effectiveSettings.commentWeight + recencyBonusA;
    const scoreB =
      (b.points || 0) + b.comments_count * effectiveSettings.commentWeight + recencyBonusB;

    return scoreB - scoreA;
  });

  return sorted.slice(0, effectiveSettings.maxPosts);
}
