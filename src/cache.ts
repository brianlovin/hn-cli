import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import type { HackerNewsPost } from "./types";
import type { TLDRResult } from "./services/TLDRService";

// Cache lives in temp directory so it persists across hot reloads
const CACHE_DIR = join(tmpdir(), "hn-cli-cache");
const CACHE_FILE = join(CACHE_DIR, "state.json");

// Persistent cache for AI-generated content (survives reboots)
const PERSISTENT_CACHE_DIR = join(homedir(), ".cache", "hn-cli");
const TLDR_CACHE_FILE = join(PERSISTENT_CACHE_DIR, "tldr-cache.json");
const CHAT_CACHE_FILE = join(PERSISTENT_CACHE_DIR, "chat-cache.json");

// Stories cache expires after 5 minutes
const STORIES_TTL_MS = 5 * 60 * 1000;

// TLDR and chat cache expires after 7 days
const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedChatSession {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  suggestions: string[];
  originalSuggestions: string[];
  followUpCount: number;
}

// Persistent TLDR cache entry with timestamp
export interface CachedTLDR {
  result: TLDRResult;
  cachedAt: number;
}

// Persistent chat session with timestamp
export interface PersistentChatSession extends CachedChatSession {
  cachedAt: number;
}

// Persistent TLDR cache (keyed by story ID as string for JSON)
export interface TLDRCache {
  entries: Record<string, CachedTLDR>;
}

// Persistent chat cache (keyed by story ID as string for JSON)
export interface ChatCache {
  sessions: Record<string, PersistentChatSession>;
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

// ============================================
// Persistent TLDR Cache (7-day expiry)
// ============================================

function ensurePersistentCacheDir(): void {
  if (!existsSync(PERSISTENT_CACHE_DIR)) {
    mkdirSync(PERSISTENT_CACHE_DIR, { recursive: true });
  }
}

export function loadTLDRCache(): Map<number, TLDRResult> {
  const map = new Map<number, TLDRResult>();
  try {
    if (!existsSync(TLDR_CACHE_FILE)) {
      return map;
    }

    const content = readFileSync(TLDR_CACHE_FILE, "utf-8");
    const cache: TLDRCache = JSON.parse(content);
    const now = Date.now();

    // Load only non-expired entries
    for (const [id, entry] of Object.entries(cache.entries)) {
      const age = now - entry.cachedAt;
      if (age <= AI_CACHE_TTL_MS) {
        map.set(Number(id), entry.result);
      }
    }
  } catch {
    // Silently fail - caching is optional
  }
  return map;
}

export function saveTLDRCache(tldrCache: Map<number, TLDRResult>): void {
  try {
    ensurePersistentCacheDir();

    // Load existing cache to preserve timestamps for existing entries
    let existingEntries: Record<string, CachedTLDR> = {};
    if (existsSync(TLDR_CACHE_FILE)) {
      try {
        const content = readFileSync(TLDR_CACHE_FILE, "utf-8");
        const existing: TLDRCache = JSON.parse(content);
        existingEntries = existing.entries;
      } catch {
        // Ignore errors reading existing cache
      }
    }

    const now = Date.now();
    const entries: Record<string, CachedTLDR> = {};

    for (const [id, result] of tldrCache) {
      const idStr = String(id);
      // Preserve existing timestamp if entry already exists, otherwise use now
      const cachedAt = existingEntries[idStr]?.cachedAt ?? now;
      // Only save if not expired
      if (now - cachedAt <= AI_CACHE_TTL_MS) {
        entries[idStr] = { result, cachedAt };
      }
    }

    const cache: TLDRCache = { entries };
    writeFileSync(TLDR_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Silently fail - caching is optional
  }
}

// ============================================
// Persistent Chat Cache (7-day expiry)
// ============================================

export function loadChatCache(): Map<number, CachedChatSession> {
  const map = new Map<number, CachedChatSession>();
  try {
    if (!existsSync(CHAT_CACHE_FILE)) {
      return map;
    }

    const content = readFileSync(CHAT_CACHE_FILE, "utf-8");
    const cache: ChatCache = JSON.parse(content);
    const now = Date.now();

    // Load only non-expired entries
    for (const [id, session] of Object.entries(cache.sessions)) {
      const age = now - session.cachedAt;
      if (age <= AI_CACHE_TTL_MS) {
        // Strip cachedAt when returning to match CachedChatSession interface
        const { cachedAt, ...sessionData } = session;
        map.set(Number(id), sessionData);
      }
    }
  } catch {
    // Silently fail - caching is optional
  }
  return map;
}

export function saveChatCache(sessions: Map<number, CachedChatSession>): void {
  try {
    ensurePersistentCacheDir();

    // Load existing cache to preserve timestamps for existing entries
    let existingEntries: Record<string, PersistentChatSession> = {};
    if (existsSync(CHAT_CACHE_FILE)) {
      try {
        const content = readFileSync(CHAT_CACHE_FILE, "utf-8");
        const existing: ChatCache = JSON.parse(content);
        existingEntries = existing.sessions;
      } catch {
        // Ignore errors reading existing cache
      }
    }

    const now = Date.now();
    const persistentSessions: Record<string, PersistentChatSession> = {};

    for (const [id, session] of sessions) {
      const idStr = String(id);
      // Preserve existing timestamp if entry already exists, otherwise use now
      const cachedAt = existingEntries[idStr]?.cachedAt ?? now;
      // Only save if not expired
      if (now - cachedAt <= AI_CACHE_TTL_MS) {
        persistentSessions[idStr] = { ...session, cachedAt };
      }
    }

    const cache: ChatCache = { sessions: persistentSessions };
    writeFileSync(CHAT_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Silently fail - caching is optional
  }
}
