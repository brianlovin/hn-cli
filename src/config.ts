import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import type { FilterSettings } from "./settings";

export type Provider = "anthropic" | "openai";

export type AnthropicModel = "claude-sonnet-4-5-20250929" | "claude-haiku-4-5-20251001" | "claude-opus-4-5-20251101";
export type OpenAIModel = "gpt-5.2-2025-12-11" | "gpt-5-mini-2025-08-07" | "gpt-5-nano-2025-08-07";

export const ANTHROPIC_MODELS: { id: AnthropicModel; name: string }[] = [
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
];

export const OPENAI_MODELS: { id: OpenAIModel; name: string }[] = [
  { id: "gpt-5-nano-2025-08-07", name: "GPT-5 Nano" },
  { id: "gpt-5-mini-2025-08-07", name: "GPT-5 Mini" },
  { id: "gpt-5.2-2025-12-11", name: "GPT-5.2" },
];

export const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = "claude-haiku-4-5-20251001";
export const DEFAULT_OPENAI_MODEL: OpenAIModel = "gpt-5-nano-2025-08-07";

// Cheap models used for auxiliary tasks (suggestions, follow-ups) to save cost.
// Currently same as defaults; change these to use smaller models if cost becomes a concern.
export const CHEAP_ANTHROPIC_MODEL: AnthropicModel = "claude-haiku-4-5-20251001";
export const CHEAP_OPENAI_MODEL: OpenAIModel = "gpt-5-nano-2025-08-07";

export interface Config {
  provider?: Provider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  anthropicModel?: AnthropicModel;
  openaiModel?: OpenAIModel;
  telemetryEnabled?: boolean;
  userId?: string;
  filterSettings?: FilterSettings;
}

const CONFIG_DIR = join(homedir(), ".config", "hn-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Sanitize config to ensure consistency:
 * - Model preferences only exist for providers with API keys
 * - Provider preference only exists if that provider has a key
 */
function sanitizeConfig(config: Config): Config {
  // Remove model preferences for providers without keys
  if (!config.anthropicApiKey) {
    delete config.anthropicModel;
  }
  if (!config.openaiApiKey) {
    delete config.openaiModel;
  }

  // Remove provider preference if that provider has no key
  if (config.provider) {
    const hasKey = config.provider === "anthropic"
      ? !!config.anthropicApiKey
      : !!config.openaiApiKey;
    if (!hasKey) {
      delete config.provider;
    }
  }

  return config;
}

export function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const config = JSON.parse(content) as Config;
      // Sanitize on load to clean up any orphaned preferences
      return sanitizeConfig(config);
    }
  } catch {
    // If config is corrupted, return empty
  }
  return {};
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  // Sanitize before saving to ensure consistency
  const sanitized = sanitizeConfig(config);
  writeFileSync(CONFIG_FILE, JSON.stringify(sanitized, null, 2));
}

export function getApiKey(provider: Provider): string | undefined {
  // Check environment variables first
  if (provider === "anthropic") {
    if (process.env.ANTHROPIC_API_KEY) {
      return process.env.ANTHROPIC_API_KEY;
    }
  } else if (provider === "openai") {
    if (process.env.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }
  }

  // Fall back to stored config
  const config = loadConfig();
  if (provider === "anthropic") {
    return config.anthropicApiKey;
  } else {
    return config.openaiApiKey;
  }
}

export function getConfiguredProvider(): Provider | undefined {
  // Check environment variables first
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";

  // Check stored config
  const config = loadConfig();
  if (config.provider && getApiKey(config.provider)) {
    return config.provider;
  }
  if (config.anthropicApiKey) return "anthropic";
  if (config.openaiApiKey) return "openai";

  return undefined;
}

export function hasAnyApiKey(): boolean {
  return getConfiguredProvider() !== undefined;
}

export function getModel(provider: Provider): AnthropicModel | OpenAIModel {
  const config = loadConfig();
  if (provider === "anthropic") {
    return config.anthropicModel || DEFAULT_ANTHROPIC_MODEL;
  } else {
    return config.openaiModel || DEFAULT_OPENAI_MODEL;
  }
}

export function setModel(provider: Provider, model: AnthropicModel | OpenAIModel): void {
  const config = loadConfig();
  if (provider === "anthropic") {
    config.anthropicModel = model as AnthropicModel;
  } else {
    config.openaiModel = model as OpenAIModel;
  }
  saveConfig(config);
}

export function clearApiKey(provider: Provider): void {
  const config = loadConfig();
  if (provider === "anthropic") {
    delete config.anthropicApiKey;
    delete config.anthropicModel; // Clear model preference with key
    if (config.provider === "anthropic") {
      delete config.provider;
    }
  } else {
    delete config.openaiApiKey;
    delete config.openaiModel; // Clear model preference with key
    if (config.provider === "openai") {
      delete config.provider;
    }
  }
  saveConfig(config);
}

export function clearAllApiKeys(): void {
  // Clear API-related settings but preserve telemetry and filter settings
  const config = loadConfig();
  saveConfig({
    telemetryEnabled: config.telemetryEnabled,
    userId: config.userId,
    filterSettings: config.filterSettings,
  });
}

// Telemetry settings

/**
 * Check if telemetry is enabled (default: true)
 */
export function isTelemetryEnabled(): boolean {
  const config = loadConfig();
  return config.telemetryEnabled !== false;
}

/**
 * Enable or disable telemetry
 */
export function setTelemetryEnabled(enabled: boolean): void {
  const config = loadConfig();
  config.telemetryEnabled = enabled;
  saveConfig(config);
}

/**
 * Get or generate anonymous user ID for telemetry
 */
export function getUserId(): string {
  const config = loadConfig();
  if (config.userId) {
    return config.userId;
  }

  // Generate a new UUID
  const userId = crypto.randomUUID();
  config.userId = userId;
  saveConfig(config);
  return userId;
}
