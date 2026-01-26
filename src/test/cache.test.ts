import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { TLDRResult } from "../services/TLDRService";
import {
  loadTLDRCache,
  saveTLDRCache,
  loadChatCache,
  saveChatCache,
  setPersistentCachePaths,
  resetPersistentCachePaths,
  AI_CACHE_TTL_MS,
  type CachedChatSession,
  type TLDRCache,
  type ChatCache,
} from "../cache";

// Unique test cache directory for each test run
const TEST_CACHE_DIR = join(tmpdir(), "hn-cli-cache-test-" + Date.now());
const TEST_TLDR_FILE = join(TEST_CACHE_DIR, "tldr-cache.json");
const TEST_CHAT_FILE = join(TEST_CACHE_DIR, "chat-cache.json");

function ensureTestCacheDir(): void {
  if (!existsSync(TEST_CACHE_DIR)) {
    mkdirSync(TEST_CACHE_DIR, { recursive: true });
  }
}

function cleanupTestCacheDir(): void {
  if (existsSync(TEST_CACHE_DIR)) {
    rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  }
}

describe("Persistent TLDR Cache", () => {
  beforeEach(() => {
    cleanupTestCacheDir();
    ensureTestCacheDir();
    setPersistentCachePaths(TEST_CACHE_DIR);
  });

  afterEach(() => {
    resetPersistentCachePaths();
    cleanupTestCacheDir();
  });

  it("should return empty map when cache file does not exist", () => {
    const cache = loadTLDRCache();
    expect(cache.size).toBe(0);
  });

  it("should save and load TLDR cache correctly", () => {
    const tldrResult: TLDRResult = {
      articleSummary: "This is an article summary",
      discussionSummary: "This is a discussion summary",
    };

    const cache = new Map<number, TLDRResult>();
    cache.set(12345, tldrResult);

    saveTLDRCache(cache);
    const loaded = loadTLDRCache();

    expect(loaded.size).toBe(1);
    expect(loaded.get(12345)).toEqual(tldrResult);
  });

  it("should handle multiple TLDR entries", () => {
    const cache = new Map<number, TLDRResult>();
    cache.set(1, { articleSummary: "Article 1", discussionSummary: "Discussion 1" });
    cache.set(2, { articleSummary: "Article 2", discussionSummary: "Discussion 2" });
    cache.set(3, { articleSummary: "Article 3", discussionSummary: "Discussion 3" });

    saveTLDRCache(cache);
    const loaded = loadTLDRCache();

    expect(loaded.size).toBe(3);
    expect(loaded.get(1)?.articleSummary).toBe("Article 1");
    expect(loaded.get(2)?.articleSummary).toBe("Article 2");
    expect(loaded.get(3)?.articleSummary).toBe("Article 3");
  });

  it("should preserve existing timestamps when updating cache", () => {
    // Save initial entry
    const cache1 = new Map<number, TLDRResult>();
    cache1.set(1, { articleSummary: "Original", discussionSummary: "Original" });
    saveTLDRCache(cache1);

    // Read the file to get the original timestamp
    const content1 = JSON.parse(readFileSync(TEST_TLDR_FILE, "utf-8"));
    const originalTimestamp = content1.entries["1"].cachedAt;

    // Wait a bit and save updated content
    const cache2 = new Map<number, TLDRResult>();
    cache2.set(1, { articleSummary: "Updated", discussionSummary: "Updated" });
    saveTLDRCache(cache2);

    // Timestamp should be preserved
    const content2 = JSON.parse(readFileSync(TEST_TLDR_FILE, "utf-8"));
    expect(content2.entries["1"].cachedAt).toBe(originalTimestamp);
    expect(content2.entries["1"].result.articleSummary).toBe("Updated");
  });

  it("should filter out expired entries when loading", () => {
    // Create a cache file with an expired entry
    const expiredTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
    const freshTimestamp = Date.now();

    const cacheData: TLDRCache = {
      entries: {
        "1": {
          result: { articleSummary: "Expired", discussionSummary: "Expired" },
          cachedAt: expiredTimestamp,
        },
        "2": {
          result: { articleSummary: "Fresh", discussionSummary: "Fresh" },
          cachedAt: freshTimestamp,
        },
      },
    };

    writeFileSync(TEST_TLDR_FILE, JSON.stringify(cacheData));

    const loaded = loadTLDRCache();
    expect(loaded.size).toBe(1);
    expect(loaded.has(1)).toBe(false);
    expect(loaded.get(2)?.articleSummary).toBe("Fresh");
  });

  it("should not save expired entries", () => {
    // Create a cache file with an expired entry
    const expiredTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago

    const existingCache: TLDRCache = {
      entries: {
        "1": {
          result: { articleSummary: "Expired", discussionSummary: "Expired" },
          cachedAt: expiredTimestamp,
        },
      },
    };

    writeFileSync(TEST_TLDR_FILE, JSON.stringify(existingCache));

    // Save with the same entry (which has an expired timestamp)
    const cache = new Map<number, TLDRResult>();
    cache.set(1, { articleSummary: "Updated", discussionSummary: "Updated" });
    saveTLDRCache(cache);

    // Entry should not be saved because its timestamp was expired
    const content = JSON.parse(readFileSync(TEST_TLDR_FILE, "utf-8"));
    expect(content.entries["1"]).toBeUndefined();
  });

  it("should handle malformed cache file gracefully", () => {
    writeFileSync(TEST_TLDR_FILE, "{ invalid json");

    const loaded = loadTLDRCache();
    expect(loaded.size).toBe(0);
  });

  it("should use correct TTL value (7 days)", () => {
    // Verify the TTL constant is 7 days in milliseconds
    expect(AI_CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("Persistent Chat Cache", () => {
  beforeEach(() => {
    cleanupTestCacheDir();
    ensureTestCacheDir();
    setPersistentCachePaths(TEST_CACHE_DIR);
  });

  afterEach(() => {
    resetPersistentCachePaths();
    cleanupTestCacheDir();
  });

  it("should return empty map when cache file does not exist", () => {
    const cache = loadChatCache();
    expect(cache.size).toBe(0);
  });

  it("should save and load chat session correctly", () => {
    const session: CachedChatSession = {
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ],
      suggestions: ["What's next?", "Tell me more"],
      originalSuggestions: ["What's next?", "Tell me more"],
      followUpCount: 1,
    };

    const cache = new Map<number, CachedChatSession>();
    cache.set(12345, session);

    saveChatCache(cache);
    const loaded = loadChatCache();

    expect(loaded.size).toBe(1);
    const loadedSession = loaded.get(12345);
    expect(loadedSession?.messages).toEqual(session.messages);
    expect(loadedSession?.suggestions).toEqual(session.suggestions);
    expect(loadedSession?.followUpCount).toBe(1);
  });

  it("should handle multiple chat sessions", () => {
    const cache = new Map<number, CachedChatSession>();
    cache.set(1, {
      messages: [{ role: "user", content: "Q1" }],
      suggestions: [],
      originalSuggestions: [],
      followUpCount: 0,
    });
    cache.set(2, {
      messages: [{ role: "user", content: "Q2" }],
      suggestions: [],
      originalSuggestions: [],
      followUpCount: 0,
    });

    saveChatCache(cache);
    const loaded = loadChatCache();

    expect(loaded.size).toBe(2);
    expect(loaded.get(1)?.messages[0]?.content).toBe("Q1");
    expect(loaded.get(2)?.messages[0]?.content).toBe("Q2");
  });

  it("should strip cachedAt from loaded sessions", () => {
    const chatData: ChatCache = {
      sessions: {
        "1": {
          messages: [{ role: "user", content: "Test" }],
          suggestions: [],
          originalSuggestions: [],
          followUpCount: 0,
          cachedAt: Date.now(),
        },
      },
    };

    writeFileSync(TEST_CHAT_FILE, JSON.stringify(chatData));

    const loaded = loadChatCache();
    const session = loaded.get(1);

    expect(session).toBeDefined();
    expect((session as any).cachedAt).toBeUndefined();
  });

  it("should preserve existing timestamps when updating cache", () => {
    // Save initial session
    const cache1 = new Map<number, CachedChatSession>();
    cache1.set(1, {
      messages: [{ role: "user", content: "Original" }],
      suggestions: [],
      originalSuggestions: [],
      followUpCount: 0,
    });
    saveChatCache(cache1);

    // Read the file to get the original timestamp
    const content1 = JSON.parse(readFileSync(TEST_CHAT_FILE, "utf-8"));
    const originalTimestamp = content1.sessions["1"].cachedAt;

    // Save updated content
    const cache2 = new Map<number, CachedChatSession>();
    cache2.set(1, {
      messages: [{ role: "user", content: "Updated" }],
      suggestions: [],
      originalSuggestions: [],
      followUpCount: 1,
    });
    saveChatCache(cache2);

    // Timestamp should be preserved
    const content2 = JSON.parse(readFileSync(TEST_CHAT_FILE, "utf-8"));
    expect(content2.sessions["1"].cachedAt).toBe(originalTimestamp);
    expect(content2.sessions["1"].messages[0].content).toBe("Updated");
  });

  it("should filter out expired sessions when loading", () => {
    const expiredTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
    const freshTimestamp = Date.now();

    const chatData: ChatCache = {
      sessions: {
        "1": {
          messages: [{ role: "user", content: "Expired" }],
          suggestions: [],
          originalSuggestions: [],
          followUpCount: 0,
          cachedAt: expiredTimestamp,
        },
        "2": {
          messages: [{ role: "user", content: "Fresh" }],
          suggestions: [],
          originalSuggestions: [],
          followUpCount: 0,
          cachedAt: freshTimestamp,
        },
      },
    };

    writeFileSync(TEST_CHAT_FILE, JSON.stringify(chatData));

    const loaded = loadChatCache();
    expect(loaded.size).toBe(1);
    expect(loaded.has(1)).toBe(false);
    expect(loaded.get(2)?.messages[0]?.content).toBe("Fresh");
  });

  it("should handle malformed cache file gracefully", () => {
    writeFileSync(TEST_CHAT_FILE, "not valid json at all");

    const loaded = loadChatCache();
    expect(loaded.size).toBe(0);
  });

  it("should handle empty messages array", () => {
    const cache = new Map<number, CachedChatSession>();
    cache.set(1, {
      messages: [],
      suggestions: [],
      originalSuggestions: [],
      followUpCount: 0,
    });

    saveChatCache(cache);
    const loaded = loadChatCache();

    expect(loaded.size).toBe(1);
    expect(loaded.get(1)?.messages).toEqual([]);
  });
});

describe("Cache Integration", () => {
  beforeEach(() => {
    cleanupTestCacheDir();
    setPersistentCachePaths(TEST_CACHE_DIR);
  });

  afterEach(() => {
    resetPersistentCachePaths();
    cleanupTestCacheDir();
  });

  it("should create cache directory if it does not exist", () => {
    expect(existsSync(TEST_CACHE_DIR)).toBe(false);

    const cache = new Map<number, TLDRResult>();
    cache.set(1, { articleSummary: "Test", discussionSummary: "Test" });
    saveTLDRCache(cache);

    expect(existsSync(TEST_CACHE_DIR)).toBe(true);
    expect(existsSync(TEST_TLDR_FILE)).toBe(true);
  });

  it("should handle both TLDR and chat caches independently", () => {
    ensureTestCacheDir();

    // Save TLDR cache
    const tldrCache = new Map<number, TLDRResult>();
    tldrCache.set(1, { articleSummary: "TLDR", discussionSummary: "TLDR" });
    saveTLDRCache(tldrCache);

    // Save chat cache
    const chatCache = new Map<number, CachedChatSession>();
    chatCache.set(1, {
      messages: [{ role: "user", content: "Chat" }],
      suggestions: [],
      originalSuggestions: [],
      followUpCount: 0,
    });
    saveChatCache(chatCache);

    // Load both
    const loadedTldr = loadTLDRCache();
    const loadedChat = loadChatCache();

    expect(loadedTldr.get(1)?.articleSummary).toBe("TLDR");
    expect(loadedChat.get(1)?.messages[0]?.content).toBe("Chat");
  });

  it("should handle numeric ID conversion correctly", () => {
    ensureTestCacheDir();

    // Test that string keys in JSON are properly converted to numeric Map keys
    const cache = new Map<number, TLDRResult>();
    const largeId = 42345678;
    cache.set(largeId, { articleSummary: "Large ID", discussionSummary: "Large ID" });

    saveTLDRCache(cache);
    const loaded = loadTLDRCache();

    expect(loaded.has(largeId)).toBe(true);
    expect(loaded.get(largeId)?.articleSummary).toBe("Large ID");
  });
});
