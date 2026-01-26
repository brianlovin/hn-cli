/**
 * Configurable filter settings for the HN CLI.
 * These control story filtering, ranking, comment display, and caching behavior.
 */

import { loadConfig, saveConfig } from "./config";

// ============================================================================
// Settings Interface
// ============================================================================

export interface FilterSettings {
  // Story filtering
  maxPosts: number;           // Maximum stories to display (default: 24)
  fetchLimit: number;         // Number of posts to fetch from API (default: 200)
  hoursWindow: number;        // Only show posts from last N hours (default: 24)
  minPoints: number;          // Minimum points threshold (default: 50)
  minComments: number;        // Minimum comments threshold (default: 20)

  // Ranking algorithm
  commentWeight: number;      // Weight for comments in ranking score (default: 0.75)
  recencyBonusMax: number;    // Maximum recency bonus points (default: 100)

  // Comment display
  maxRootComments: number;    // Max root-level comments per story (default: 12)
  maxChildComments: number;   // Max child comments per parent (default: 8)
  maxCommentLevel: number;    // Max comment nesting depth (default: 3)

  // Cache
  storiesTtlMinutes: number;  // Stories cache TTL in minutes (default: 5)
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_SETTINGS: FilterSettings = {
  // Story filtering (matching briOS implementation)
  maxPosts: 24,
  fetchLimit: 200,
  hoursWindow: 24,
  minPoints: 50,
  minComments: 20,

  // Ranking algorithm
  commentWeight: 0.75,
  recencyBonusMax: 100,

  // Comment display
  maxRootComments: 12,
  maxChildComments: 8,
  maxCommentLevel: 3,

  // Cache
  storiesTtlMinutes: 5,
};

// ============================================================================
// Validation Ranges
// ============================================================================

export interface SettingRange {
  min: number;
  max: number;
  step: number;
  label: string;
  description: string;
}

export const SETTING_RANGES: Record<keyof FilterSettings, SettingRange> = {
  maxPosts: {
    min: 1,
    max: 50,
    step: 1,
    label: "Max Stories",
    description: "Maximum number of stories to display",
  },
  fetchLimit: {
    min: 50,
    max: 500,
    step: 50,
    label: "Fetch Limit",
    description: "Number of posts to fetch from HN API",
  },
  hoursWindow: {
    min: 1,
    max: 168,
    step: 1,
    label: "Time Window (hours)",
    description: "Only show posts from the last N hours",
  },
  minPoints: {
    min: 0,
    max: 500,
    step: 10,
    label: "Min Points",
    description: "Minimum points for a story to appear",
  },
  minComments: {
    min: 0,
    max: 100,
    step: 5,
    label: "Min Comments",
    description: "Minimum comments for a story to appear",
  },
  commentWeight: {
    min: 0,
    max: 2,
    step: 0.25,
    label: "Comment Weight",
    description: "Weight of comments in ranking (0-2)",
  },
  recencyBonusMax: {
    min: 0,
    max: 200,
    step: 10,
    label: "Recency Bonus",
    description: "Maximum bonus points for new posts",
  },
  maxRootComments: {
    min: 1,
    max: 50,
    step: 1,
    label: "Root Comments",
    description: "Maximum root-level comments per story",
  },
  maxChildComments: {
    min: 1,
    max: 20,
    step: 1,
    label: "Child Comments",
    description: "Maximum replies per comment",
  },
  maxCommentLevel: {
    min: 1,
    max: 10,
    step: 1,
    label: "Nesting Depth",
    description: "Maximum comment nesting levels",
  },
  storiesTtlMinutes: {
    min: 1,
    max: 60,
    step: 1,
    label: "Cache TTL (min)",
    description: "How long to cache stories before refresh",
  },
};

// ============================================================================
// Setting Categories (for UI organization)
// ============================================================================

export interface SettingCategory {
  key: string;
  label: string;
  settings: (keyof FilterSettings)[];
}

export const SETTING_CATEGORIES: SettingCategory[] = [
  {
    key: "filtering",
    label: "Story Filtering",
    settings: ["maxPosts", "hoursWindow", "minPoints", "minComments"],
  },
  {
    key: "ranking",
    label: "Ranking",
    settings: ["commentWeight", "recencyBonusMax"],
  },
  {
    key: "comments",
    label: "Comments",
    settings: ["maxRootComments", "maxChildComments", "maxCommentLevel"],
  },
  {
    key: "advanced",
    label: "Advanced",
    settings: ["fetchLimit", "storiesTtlMinutes"],
  },
];

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate and clamp a setting value to its allowed range.
 */
export function validateSetting<K extends keyof FilterSettings>(
  key: K,
  value: number
): number {
  const range = SETTING_RANGES[key];
  // Clamp to min/max
  const clamped = Math.max(range.min, Math.min(range.max, value));
  // Round to step
  const steps = Math.round((clamped - range.min) / range.step);
  return range.min + steps * range.step;
}

/**
 * Validate all settings, returning a sanitized copy.
 */
export function validateSettings(settings: Partial<FilterSettings>): FilterSettings {
  const validated: FilterSettings = { ...DEFAULT_SETTINGS };

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof FilterSettings)[]) {
    if (settings[key] !== undefined) {
      validated[key] = validateSetting(key, settings[key] as number);
    }
  }

  return validated;
}

// ============================================================================
// Load / Save / Reset
// ============================================================================

/**
 * Load filter settings from config, with defaults for missing values.
 */
export function loadSettings(): FilterSettings {
  const config = loadConfig();
  if (!config.filterSettings) {
    return { ...DEFAULT_SETTINGS };
  }
  return validateSettings(config.filterSettings);
}

/**
 * Save filter settings to config.
 */
export function saveSettings(settings: FilterSettings): void {
  const config = loadConfig();
  config.filterSettings = validateSettings(settings);
  saveConfig(config);
}

/**
 * Update a single setting value.
 */
export function updateSetting<K extends keyof FilterSettings>(
  key: K,
  value: number
): FilterSettings {
  const settings = loadSettings();
  settings[key] = validateSetting(key, value);
  saveSettings(settings);
  return settings;
}

/**
 * Reset all settings to defaults.
 */
export function resetSettings(): FilterSettings {
  saveSettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

/**
 * Reset a single setting to its default value.
 */
export function resetSetting<K extends keyof FilterSettings>(key: K): FilterSettings {
  const settings = loadSettings();
  settings[key] = DEFAULT_SETTINGS[key];
  saveSettings(settings);
  return settings;
}

/**
 * Check if a setting differs from its default value.
 */
export function isModified(key: keyof FilterSettings): boolean {
  const settings = loadSettings();
  return settings[key] !== DEFAULT_SETTINGS[key];
}

/**
 * Check if any settings differ from defaults.
 */
export function hasModifiedSettings(): boolean {
  const settings = loadSettings();
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof FilterSettings)[]) {
    if (settings[key] !== DEFAULT_SETTINGS[key]) {
      return true;
    }
  }
  return false;
}

/**
 * Format a setting value for display.
 */
export function formatSettingValue(key: keyof FilterSettings, value: number): string {
  if (key === "commentWeight") {
    return value.toFixed(2);
  }
  return String(value);
}
