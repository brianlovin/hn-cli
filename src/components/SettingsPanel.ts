import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type RenderContext,
  bold,
  t,
} from "@opentui/core";
import { COLORS } from "../theme";
import {
  type Provider,
  type AnthropicModel,
  type OpenAIModel,
  getApiKey,
  getModel,
  isTelemetryEnabled,
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
} from "../config";
import {
  loadSettings,
  SETTING_RANGES,
  SETTING_CATEGORIES,
  DEFAULT_SETTINGS,
  formatSettingValue,
  hasModifiedSettings,
  type FilterSettings,
} from "../settings";
import { createShortcutsBar, SETTINGS_SHORTCUTS } from "./ShortcutsBar";

const PROVIDER_API_KEY_URLS: Record<Provider, { display: string; full: string }> = {
  anthropic: {
    display: "platform.claude.com",
    full: "https://platform.claude.com/settings/keys",
  },
  openai: {
    display: "platform.openai.com",
    full: "https://platform.openai.com/api-keys",
  },
};

type SettingsItemType =
  | { type: "provider"; provider: Provider; hasKey: boolean }
  | { type: "model"; modelId: AnthropicModel | OpenAIModel; modelName: string }
  | { type: "telemetry"; enabled: boolean }
  | { type: "action"; action: "done" | "clear_keys" | "reset_filters" }
  | { type: "category_header"; label: string }
  | { type: "filter_setting"; key: keyof FilterSettings; value: number; isModified: boolean };

interface SettingsListItem {
  item: SettingsItemType;
  enabled: boolean;
}

export interface SettingsState {
  selectedIndex: number;
  header: BoxRenderable;
  scroll: ScrollBoxRenderable;
  content: BoxRenderable;
  shortcutsBar: BoxRenderable;
}

export function initSettingsState(ctx: RenderContext): SettingsState {
  // Fixed header at top
  const header = new BoxRenderable(ctx, {
    id: "settings-header",
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    paddingLeft: 2,
    paddingRight: 2,
    paddingTop: 1,
    paddingBottom: 1,
    borderStyle: "single",
    border: ["bottom"],
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  });

  // Add "Settings" title to header
  const title = new TextRenderable(ctx, {
    content: "Settings",
    fg: COLORS.accent,
  });
  header.add(title);

  // Scrollable area for settings content
  const scroll = new ScrollBoxRenderable(ctx, {
    width: "100%",
    flexGrow: 1,
    scrollY: true,
    backgroundColor: COLORS.bg,
    contentOptions: {
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      backgroundColor: COLORS.bg,
    },
  });

  // Content container inside scroll
  const content = new BoxRenderable(ctx, {
    width: "100%",
    flexDirection: "column",
    backgroundColor: COLORS.bg,
  });

  scroll.add(content);

  // Fixed shortcuts bar at bottom
  const shortcutsBar = createShortcutsBar(ctx, SETTINGS_SHORTCUTS);

  return {
    selectedIndex: 0,
    header,
    scroll,
    content,
    shortcutsBar,
  };
}

function getSettingsList(chatProvider: Provider): SettingsListItem[] {
  const hasAnthropic = !!getApiKey("anthropic");
  const hasOpenAI = !!getApiKey("openai");
  const hasAnyKey = hasAnthropic || hasOpenAI;
  const models = chatProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
  const settings = loadSettings();

  const items: SettingsListItem[] = [];

  // Provider options (always enabled - selecting without key triggers add flow)
  items.push({
    item: { type: "provider", provider: "anthropic", hasKey: hasAnthropic },
    enabled: true,
  });
  items.push({
    item: { type: "provider", provider: "openai", hasKey: hasOpenAI },
    enabled: true,
  });

  // Model options only shown when at least one provider has a key
  if (hasAnyKey) {
    for (const model of models) {
      items.push({
        item: { type: "model", modelId: model.id, modelName: model.name },
        enabled: true,
      });
    }
  }

  // Telemetry toggle
  items.push({
    item: { type: "telemetry", enabled: isTelemetryEnabled() },
    enabled: true,
  });

  // Filter settings by category
  for (const category of SETTING_CATEGORIES) {
    // Add category header (not selectable)
    items.push({
      item: { type: "category_header", label: category.label },
      enabled: false,
    });

    // Add each setting in this category
    for (const key of category.settings) {
      const value = settings[key];
      const isModified = value !== DEFAULT_SETTINGS[key];
      items.push({
        item: { type: "filter_setting", key, value, isModified },
        enabled: true,
      });
    }
  }

  // Action buttons
  items.push({
    item: { type: "action", action: "done" },
    enabled: true,
  });

  if (hasModifiedSettings()) {
    items.push({
      item: { type: "action", action: "reset_filters" },
      enabled: true,
    });
  }

  if (hasAnyKey) {
    items.push({
      item: { type: "action", action: "clear_keys" },
      enabled: true,
    });
  }

  return items;
}

export function renderSettings(
  ctx: RenderContext,
  state: SettingsState,
  chatProvider: Provider,
): void {
  // Clear existing content
  for (const child of state.content.getChildren()) {
    state.content.remove(child.id);
  }

  const items = getSettingsList(chatProvider);
  const currentModel = getModel(chatProvider);

  // Provider section
  const providerHeader = new TextRenderable(ctx, {
    content: t`${bold("Provider")}`,
    fg: COLORS.textSecondary,
  });
  state.content.add(providerHeader);

  for (let i = 0; i < items.length; i++) {
    const listItem = items[i];
    if (!listItem || listItem.item.type !== "provider") continue;

    const isSelected = i === state.selectedIndex;
    const isActive = listItem.item.provider === chatProvider;
    const hasKey = listItem.item.hasKey;
    const providerName = listItem.item.provider === "anthropic" ? "Anthropic" : "OpenAI";

    const itemBox = new BoxRenderable(ctx, {
      flexDirection: "row",
      gap: 1,
    });

    const indicator = new TextRenderable(ctx, {
      content: isSelected ? "›" : " ",
      fg: COLORS.accent,
    });
    itemBox.add(indicator);

    const radio = new TextRenderable(ctx, {
      content: isActive ? "●" : "○",
      fg: isActive ? COLORS.accent : COLORS.textSecondary,
    });
    itemBox.add(radio);

    const label = new TextRenderable(ctx, {
      content: providerName,
      fg: isSelected ? COLORS.accent : COLORS.textPrimary,
    });
    itemBox.add(label);

    if (!hasKey) {
      const hint = new TextRenderable(ctx, {
        content: `${PROVIDER_API_KEY_URLS[listItem.item.provider].display} (tab)`,
        fg: COLORS.textTertiary,
      });
      itemBox.add(hint);
    }

    state.content.add(itemBox);
  }

  // Model section - only shown when there are model items
  const hasModelItems = items.some(item => item.item.type === "model");
  if (hasModelItems) {
    state.content.add(new BoxRenderable(ctx, { height: 1 }));

    const modelHeader = new TextRenderable(ctx, {
      content: t`${bold("Model")}`,
      fg: COLORS.textSecondary,
    });
    state.content.add(modelHeader);

    for (let i = 0; i < items.length; i++) {
      const listItem = items[i];
      if (!listItem || listItem.item.type !== "model") continue;

      const isSelected = i === state.selectedIndex;
      const isActive = listItem.item.modelId === currentModel;

      const itemBox = new BoxRenderable(ctx, {
        flexDirection: "row",
        gap: 1,
      });

      const indicator = new TextRenderable(ctx, {
        content: isSelected ? "›" : " ",
        fg: COLORS.accent,
      });
      itemBox.add(indicator);

      const radio = new TextRenderable(ctx, {
        content: isActive ? "●" : "○",
        fg: isActive ? COLORS.accent : COLORS.textSecondary,
      });
      itemBox.add(radio);

      const label = new TextRenderable(ctx, {
        content: listItem.item.modelName,
        fg: isSelected ? COLORS.accent : COLORS.textPrimary,
      });
      itemBox.add(label);

      state.content.add(itemBox);
    }
  }

  // Telemetry section
  state.content.add(new BoxRenderable(ctx, { height: 1 }));

  const telemetryHeader = new TextRenderable(ctx, {
    content: t`${bold("Telemetry")}`,
    fg: COLORS.textSecondary,
  });
  state.content.add(telemetryHeader);

  for (let i = 0; i < items.length; i++) {
    const listItem = items[i];
    if (!listItem || listItem.item.type !== "telemetry") continue;

    const isSelected = i === state.selectedIndex;
    const isEnabled = listItem.item.enabled;

    const itemBox = new BoxRenderable(ctx, {
      flexDirection: "row",
      gap: 1,
    });

    const indicator = new TextRenderable(ctx, {
      content: isSelected ? "›" : " ",
      fg: COLORS.accent,
    });
    itemBox.add(indicator);

    const toggle = new TextRenderable(ctx, {
      content: isEnabled ? "●" : "○",
      fg: isEnabled ? COLORS.accent : COLORS.textSecondary,
    });
    itemBox.add(toggle);

    const label = new TextRenderable(ctx, {
      content: isEnabled ? "Enabled" : "Disabled",
      fg: isSelected ? COLORS.accent : COLORS.textPrimary,
    });
    itemBox.add(label);

    state.content.add(itemBox);
  }

  // Filter settings sections
  let currentCategoryKey: string | null = null;
  for (let i = 0; i < items.length; i++) {
    const listItem = items[i];
    if (!listItem) continue;

    // Render category headers
    if (listItem.item.type === "category_header") {
      state.content.add(new BoxRenderable(ctx, { height: 1 }));
      const categoryHeader = new TextRenderable(ctx, {
        content: t`${bold(listItem.item.label)}`,
        fg: COLORS.textSecondary,
      });
      state.content.add(categoryHeader);
      currentCategoryKey = listItem.item.label;
      continue;
    }

    // Render filter settings
    if (listItem.item.type === "filter_setting") {
      const isSelected = i === state.selectedIndex;
      const range = SETTING_RANGES[listItem.item.key];
      const formattedValue = formatSettingValue(listItem.item.key, listItem.item.value);

      const itemBox = new BoxRenderable(ctx, {
        flexDirection: "row",
        gap: 1,
      });

      const indicator = new TextRenderable(ctx, {
        content: isSelected ? "›" : " ",
        fg: COLORS.accent,
      });
      itemBox.add(indicator);

      const label = new TextRenderable(ctx, {
        content: range.label,
        fg: isSelected ? COLORS.accent : COLORS.textPrimary,
      });
      itemBox.add(label);

      const valueText = new TextRenderable(ctx, {
        content: `[${formattedValue}]`,
        fg: listItem.item.isModified ? COLORS.accent : COLORS.textSecondary,
      });
      itemBox.add(valueText);

      if (listItem.item.isModified) {
        const modifiedIndicator = new TextRenderable(ctx, {
          content: "*",
          fg: COLORS.accent,
        });
        itemBox.add(modifiedIndicator);
      }

      state.content.add(itemBox);
    }
  }

  state.content.add(new BoxRenderable(ctx, { height: 1 }));

  // Actions section
  for (let i = 0; i < items.length; i++) {
    const listItem = items[i];
    if (!listItem || listItem.item.type !== "action") continue;

    const isSelected = i === state.selectedIndex;
    let label = "";
    switch (listItem.item.action) {
      case "done":
        label = "Done";
        break;
      case "reset_filters":
        label = "Reset All to Defaults";
        break;
      case "clear_keys":
        label = "Clear All API Keys";
        break;
    }

    const itemBox = new BoxRenderable(ctx, {
      flexDirection: "row",
      gap: 1,
    });

    const indicator = new TextRenderable(ctx, {
      content: isSelected ? "›" : " ",
      fg: COLORS.accent,
    });
    itemBox.add(indicator);

    const text = new TextRenderable(ctx, {
      content: `[${label}]`,
      fg: isSelected ? COLORS.accent : COLORS.textPrimary,
    });
    itemBox.add(text);

    state.content.add(itemBox);
  }

  // Reset scroll position
  state.scroll.scrollTop = 0;
}

export function navigateSettings(
  state: SettingsState,
  delta: number,
  chatProvider: Provider,
): void {
  const items = getSettingsList(chatProvider);
  const maxIndex = items.length - 1;

  // Move in the requested direction, skipping disabled items (category headers)
  let newIndex = state.selectedIndex;
  let attempts = 0;
  const maxAttempts = items.length;

  do {
    newIndex = Math.max(0, Math.min(maxIndex, newIndex + delta));
    attempts++;
    // Stop if we've hit the bounds or found an enabled item
    if (newIndex === 0 || newIndex === maxIndex || items[newIndex]?.enabled) {
      break;
    }
  } while (attempts < maxAttempts);

  // Only update if the new item is enabled
  if (items[newIndex]?.enabled) {
    state.selectedIndex = newIndex;
  }
}

export type SettingsAction =
  | { type: "switch_provider"; provider: Provider }
  | { type: "select_model"; modelId: AnthropicModel | OpenAIModel; provider: Provider }
  | { type: "add_anthropic" }
  | { type: "add_openai" }
  | { type: "clear_keys" }
  | { type: "toggle_telemetry" }
  | { type: "reset_filters" }
  | { type: "adjust_setting"; key: keyof FilterSettings; delta: number }
  | { type: "done" }
  | null;

export function selectSettingsItem(
  state: SettingsState,
  chatProvider: Provider,
): SettingsAction {
  const items = getSettingsList(chatProvider);
  const selected = items[state.selectedIndex];
  if (!selected || !selected.enabled) return null;

  switch (selected.item.type) {
    case "provider":
      // If no API key, trigger add key flow
      if (!selected.item.hasKey) {
        return selected.item.provider === "anthropic"
          ? { type: "add_anthropic" }
          : { type: "add_openai" };
      }
      // Switch provider if different from current
      if (selected.item.provider !== chatProvider) {
        return { type: "switch_provider", provider: selected.item.provider };
      }
      return null;

    case "model":
      return {
        type: "select_model",
        modelId: selected.item.modelId,
        provider: chatProvider,
      };

    case "telemetry":
      return { type: "toggle_telemetry" };

    case "filter_setting":
      // For filter settings, Enter increases the value
      return {
        type: "adjust_setting",
        key: selected.item.key,
        delta: SETTING_RANGES[selected.item.key].step,
      };

    case "action":
      switch (selected.item.action) {
        case "done":
          return { type: "done" };
        case "reset_filters":
          return { type: "reset_filters" };
        case "clear_keys":
          return { type: "clear_keys" };
      }
  }

  return null;
}

/**
 * Adjust a filter setting value (for left/right arrow keys).
 */
export function adjustSettingValue(
  state: SettingsState,
  chatProvider: Provider,
  delta: number,
): SettingsAction {
  const items = getSettingsList(chatProvider);
  const selected = items[state.selectedIndex];
  if (!selected || !selected.enabled) return null;

  if (selected.item.type === "filter_setting") {
    const step = SETTING_RANGES[selected.item.key].step;
    return {
      type: "adjust_setting",
      key: selected.item.key,
      delta: delta > 0 ? step : -step,
    };
  }

  return null;
}

export function goBackInSettings(_state: SettingsState): boolean {
  return false; // Always exit settings on Esc
}

/**
 * Returns the API key URL for the currently selected provider if it doesn't have a key.
 * Returns null if the selection is not a provider or if the provider already has a key.
 */
export function getSelectedProviderUrl(
  state: SettingsState,
  chatProvider: Provider,
): string | null {
  const items = getSettingsList(chatProvider);
  const selected = items[state.selectedIndex];
  if (!selected) return null;

  if (selected.item.type === "provider" && !selected.item.hasKey) {
    return PROVIDER_API_KEY_URLS[selected.item.provider].full;
  }

  return null;
}
