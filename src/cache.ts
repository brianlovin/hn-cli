import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { HackerNewsPost } from "./types";

// Cache lives in temp directory so it persists across hot reloads
const CACHE_DIR = join(tmpdir(), "hn-cli-cache");
const CACHE_FILE = join(CACHE_DIR, "state.json");

// Stories cache expires after 5 minutes
const STORIES_TTL_MS = 5 * 60 * 1000;

export interface CachedChatSession {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  suggestions: string[];
  originalSuggestions: string[];
  followUpCount: number;
}

export type StoryViewMode = "comments" | "chat";

export interface AppCache {
  // Stories data
  posts: HackerNewsPost[];
  selectedIndex: number;
  selectedPost: HackerNewsPost | null;
  rootCommentIndex: number;

  // UI mode
  chatMode: boolean;
  settingsMode: boolean;

  // Chat sessions (keyed by story ID as string for JSON)
  chatSessions: Record<string, CachedChatSession>;

  // Per-story view modes (keyed by story ID as string for JSON)
  storyViewModes: Record<string, StoryViewMode>;

  // Timestamps
  storiesFetchedAt: number;
  savedAt: number;
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function loadCache(): AppCache | null {
  try {
    if (!existsSync(CACHE_FILE)) {
      return null;
    }

    const content = readFileSync(CACHE_FILE, "utf-8");
    const cache: AppCache = JSON.parse(content);

    // Check if stories are still fresh
    const storiesAge = Date.now() - cache.storiesFetchedAt;
    if (storiesAge > STORIES_TTL_MS) {
      // Stories are stale, but we can still use chat sessions
      return {
        ...cache,
        posts: [], // Force refetch
        selectedIndex: -1,
        selectedPost: null,
        rootCommentIndex: 0,
        chatMode: false,
        settingsMode: false,
      };
    }

    return cache;
  } catch {
    return null;
  }
}

export function saveCache(cache: AppCache): void {
  try {
    ensureCacheDir();
    cache.savedAt = Date.now();
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Silently fail - caching is optional
  }
}

export function clearCache(): void {
  try {
    if (existsSync(CACHE_FILE)) {
      unlinkSync(CACHE_FILE);
    }
  } catch {
    // Silently fail
  }
}

// Helper to convert Map to plain object for caching
export function chatSessionsToCache(
  sessions: Map<number, CachedChatSession>
): Record<string, CachedChatSession> {
  const result: Record<string, CachedChatSession> = {};
  for (const [id, session] of sessions) {
    result[String(id)] = session;
  }
  return result;
}

// Helper to convert cached object back to Map
export function cacheToSessions(
  cached: Record<string, CachedChatSession>
): Map<number, CachedChatSession> {
  const map = new Map<number, CachedChatSession>();
  for (const [id, session] of Object.entries(cached)) {
    map.set(Number(id), session);
  }
  return map;
}

// Helper to convert view modes Map to plain object for caching
export function viewModesToCache(
  modes: Map<number, StoryViewMode>
): Record<string, StoryViewMode> {
  const result: Record<string, StoryViewMode> = {};
  for (const [id, mode] of modes) {
    result[String(id)] = mode;
  }
  return result;
}

// Helper to convert cached view modes back to Map
export function cacheToViewModes(
  cached: Record<string, StoryViewMode>
): Map<number, StoryViewMode> {
  const map = new Map<number, StoryViewMode>();
  for (const [id, mode] of Object.entries(cached)) {
    map.set(Number(id), mode);
  }
  return map;
}
