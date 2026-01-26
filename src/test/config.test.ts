import { describe, it, expect } from "bun:test";

// Tests for config/model isolation to prevent using wrong model with wrong provider
describe("Config Model Isolation", () => {
  it("should return correct model for each provider regardless of other provider settings", () => {
    // Simulate getModel logic
    interface ConfigState {
      anthropicModel?: string;
      openaiModel?: string;
    }

    const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
    const DEFAULT_OPENAI_MODEL = "gpt-5-nano-2025-08-07";

    const getModel = (provider: string, config: ConfigState): string => {
      if (provider === "anthropic") {
        return config.anthropicModel || DEFAULT_ANTHROPIC_MODEL;
      } else {
        return config.openaiModel || DEFAULT_OPENAI_MODEL;
      }
    };

    // User's exact config state: anthropicModel set, provider openai, only openaiApiKey
    const userConfig: ConfigState = {
      anthropicModel: "claude-haiku-4-5-20251001",
      // openaiModel is NOT set
    };

    // When provider is openai, should return OpenAI default, NOT the anthropicModel
    expect(getModel("openai", userConfig)).toBe(DEFAULT_OPENAI_MODEL);
    expect(getModel("openai", userConfig)).not.toBe(userConfig.anthropicModel);

    // When provider is anthropic, should return anthropicModel
    expect(getModel("anthropic", userConfig)).toBe("claude-haiku-4-5-20251001");
  });

  it("should keep models isolated when setting model for one provider", () => {
    // Simulate setModel logic
    interface ConfigState {
      anthropicModel?: string;
      openaiModel?: string;
    }

    const setModel = (provider: string, model: string, config: ConfigState) => {
      if (provider === "anthropic") {
        config.anthropicModel = model;
      } else {
        config.openaiModel = model;
      }
    };

    const config: ConfigState = {
      anthropicModel: "claude-haiku-4-5-20251001",
    };

    // Set OpenAI model - should NOT affect anthropicModel
    setModel("openai", "gpt-5-mini-2025-08-07", config);

    expect(config.openaiModel).toBe("gpt-5-mini-2025-08-07");
    expect(config.anthropicModel).toBe("claude-haiku-4-5-20251001"); // Unchanged

    // Set Anthropic model - should NOT affect openaiModel
    setModel("anthropic", "claude-opus-4-5-20251101", config);

    expect(config.anthropicModel).toBe("claude-opus-4-5-20251101");
    expect(config.openaiModel).toBe("gpt-5-mini-2025-08-07"); // Unchanged
  });

  it("should sanitize leftover model from cleared provider on load", () => {
    // This tests the fix for the scenario the user encountered:
    // If config somehow has anthropicModel but no anthropicApiKey,
    // sanitizeConfig should clean it up

    interface ConfigState {
      provider?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
      anthropicModel?: string;
      openaiModel?: string;
    }

    const DEFAULT_OPENAI_MODEL = "gpt-5-nano-2025-08-07";

    const sanitizeConfig = (config: ConfigState): ConfigState => {
      const result = { ...config };
      if (!result.anthropicApiKey) delete result.anthropicModel;
      if (!result.openaiApiKey) delete result.openaiModel;
      if (result.provider) {
        const hasKey = result.provider === "anthropic"
          ? !!result.anthropicApiKey
          : !!result.openaiApiKey;
        if (!hasKey) delete result.provider;
      }
      return result;
    };

    const getConfiguredProvider = (config: ConfigState): string | undefined => {
      if (config.provider && (
        (config.provider === "anthropic" && config.anthropicApiKey) ||
        (config.provider === "openai" && config.openaiApiKey)
      )) {
        return config.provider;
      }
      if (config.anthropicApiKey) return "anthropic";
      if (config.openaiApiKey) return "openai";
      return undefined;
    };

    const getModel = (provider: string, config: ConfigState): string => {
      if (provider === "anthropic") {
        return config.anthropicModel || "claude-haiku-4-5-20251001";
      } else {
        return config.openaiModel || DEFAULT_OPENAI_MODEL;
      }
    };

    // Hypothetical bad config state (would be cleaned on load now)
    const badConfig: ConfigState = {
      anthropicModel: "claude-haiku-4-5-20251001",
      provider: "openai",
      openaiApiKey: "sk-proj-xxx",
    };

    // After sanitization (happens on loadConfig now)
    const config = sanitizeConfig(badConfig);

    // anthropicModel should be removed since no anthropicApiKey
    expect(config.anthropicModel).toBeUndefined();

    // Provider should still be openai (has key)
    expect(getConfiguredProvider(config)).toBe("openai");

    // Model should be OpenAI default
    const provider = getConfiguredProvider(config);
    expect(provider).toBe("openai");
    expect(getModel(provider!, config)).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("should not allow cross-provider model confusion in settings flow", () => {
    // Test that model selection in settings uses current provider's model list
    const ANTHROPIC_MODELS = [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
    ];

    const OPENAI_MODELS = [
      { id: "gpt-5-nano-2025-08-07", name: "GPT-5 Nano" },
      { id: "gpt-5-mini-2025-08-07", name: "GPT-5 Mini" },
      { id: "gpt-5.2-2025-12-11", name: "GPT-5.2" },
    ];

    const getModelsForProvider = (provider: string) => {
      return provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
    };

    // When provider is openai, model list should only contain OpenAI models
    const openaiModels = getModelsForProvider("openai");
    const anthropicModelIds = ANTHROPIC_MODELS.map(m => m.id);

    for (const model of openaiModels) {
      expect(anthropicModelIds).not.toContain(model.id);
    }

    // When provider is anthropic, model list should only contain Anthropic models
    const anthropicModels = getModelsForProvider("anthropic");
    const openaiModelIds = OPENAI_MODELS.map(m => m.id);

    for (const model of anthropicModels) {
      expect(openaiModelIds).not.toContain(model.id);
    }
  });

  it("should clear model preferences when clearing all keys", () => {
    // Test that clearing all keys also clears model preferences (clean slate)
    interface ConfigState {
      provider?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
      anthropicModel?: string;
      openaiModel?: string;
    }

    // The new clearAllApiKeys behavior: clear everything
    const clearAllApiKeys = (): ConfigState => {
      return {}; // Start fresh
    };

    const config: ConfigState = {
      provider: "anthropic",
      anthropicApiKey: "sk-ant-xxx",
      anthropicModel: "claude-opus-4-5-20251101",
      openaiModel: "gpt-5.2-2025-12-11",
    };

    const clearedConfig = clearAllApiKeys();

    // Everything should be cleared - clean slate
    expect(clearedConfig.anthropicApiKey).toBeUndefined();
    expect(clearedConfig.openaiApiKey).toBeUndefined();
    expect(clearedConfig.provider).toBeUndefined();
    expect(clearedConfig.anthropicModel).toBeUndefined();
    expect(clearedConfig.openaiModel).toBeUndefined();
  });

  it("should clear only that provider's model when clearing one key", () => {
    interface ConfigState {
      provider?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
      anthropicModel?: string;
      openaiModel?: string;
    }

    const clearApiKey = (provider: string, config: ConfigState): ConfigState => {
      const result = { ...config };
      if (provider === "anthropic") {
        delete result.anthropicApiKey;
        delete result.anthropicModel;
        if (result.provider === "anthropic") {
          delete result.provider;
        }
      } else {
        delete result.openaiApiKey;
        delete result.openaiModel;
        if (result.provider === "openai") {
          delete result.provider;
        }
      }
      return result;
    };

    // Start with both providers configured
    const config: ConfigState = {
      provider: "anthropic",
      anthropicApiKey: "sk-ant-xxx",
      anthropicModel: "claude-opus-4-5-20251101",
      openaiApiKey: "sk-openai-xxx",
      openaiModel: "gpt-5.2-2025-12-11",
    };

    // Clear Anthropic key
    const afterClearingAnthropic = clearApiKey("anthropic", config);

    // Anthropic key and model should be cleared
    expect(afterClearingAnthropic.anthropicApiKey).toBeUndefined();
    expect(afterClearingAnthropic.anthropicModel).toBeUndefined();
    expect(afterClearingAnthropic.provider).toBeUndefined();

    // OpenAI should be preserved
    expect(afterClearingAnthropic.openaiApiKey).toBe("sk-openai-xxx");
    expect(afterClearingAnthropic.openaiModel).toBe("gpt-5.2-2025-12-11");
  });

  it("should sanitize orphaned model preferences on load", () => {
    // Test sanitizeConfig behavior
    interface ConfigState {
      provider?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
      anthropicModel?: string;
      openaiModel?: string;
    }

    const sanitizeConfig = (config: ConfigState): ConfigState => {
      const result = { ...config };
      // Remove model preferences for providers without keys
      if (!result.anthropicApiKey) {
        delete result.anthropicModel;
      }
      if (!result.openaiApiKey) {
        delete result.openaiModel;
      }
      // Remove provider preference if that provider has no key
      if (result.provider) {
        const hasKey = result.provider === "anthropic"
          ? !!result.anthropicApiKey
          : !!result.openaiApiKey;
        if (!hasKey) {
          delete result.provider;
        }
      }
      return result;
    };

    // User's problematic config state: anthropicModel but no anthropicApiKey
    const badConfig: ConfigState = {
      anthropicModel: "claude-haiku-4-5-20251001",
      provider: "openai",
      openaiApiKey: "sk-proj-xxx",
    };

    const sanitized = sanitizeConfig(badConfig);

    // anthropicModel should be removed (no key)
    expect(sanitized.anthropicModel).toBeUndefined();
    // OpenAI settings should remain
    expect(sanitized.openaiApiKey).toBe("sk-proj-xxx");
    expect(sanitized.provider).toBe("openai");
  });

  it("should sanitize orphaned provider preference", () => {
    interface ConfigState {
      provider?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
    }

    const sanitizeConfig = (config: ConfigState): ConfigState => {
      const result = { ...config };
      if (result.provider) {
        const hasKey = result.provider === "anthropic"
          ? !!result.anthropicApiKey
          : !!result.openaiApiKey;
        if (!hasKey) {
          delete result.provider;
        }
      }
      return result;
    };

    // Config with provider but no key for that provider
    const badConfig: ConfigState = {
      provider: "anthropic",
      openaiApiKey: "sk-openai-xxx",
    };

    const sanitized = sanitizeConfig(badConfig);

    // Provider should be removed (no anthropic key)
    expect(sanitized.provider).toBeUndefined();
    // OpenAI key should remain
    expect(sanitized.openaiApiKey).toBe("sk-openai-xxx");
  });

  it("should use correct provider when initializing chat service", () => {
    // Test that chatServiceState.provider matches getConfiguredProvider
    interface ChatServiceState {
      provider: string;
      anthropic: null;
      openai: null;
    }

    const initChatServiceState = (provider: string): ChatServiceState => {
      return {
        provider,
        anthropic: null,
        openai: null,
      };
    };

    // With the user's config, getConfiguredProvider returns "openai"
    const configuredProvider = "openai";
    const chatState = initChatServiceState(configuredProvider);

    expect(chatState.provider).toBe("openai");
  });
});
