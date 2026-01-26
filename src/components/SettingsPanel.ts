import { BoxRenderable, TextRenderable, type RenderContext, bold, t } from "@opentui/core";
import { COLORS } from "../theme";
import {
  type Provider,
  getApiKey,
  getModel,
  isTelemetryEnabled,
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
} from "../config";

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
  | { type: "model"; modelId: string; modelName: string }
  | { type: "telemetry"; enabled: boolean }
  | { type: "action"; action: "done" | "clear_keys" };

interface SettingsListItem {
  item: SettingsItemType;
  enabled: boolean;
}

export interface SettingsState {
  selectedIndex: number;
}

export function initSettingsState(): SettingsState {
  return {
    selectedIndex: 0,
  };
}

function getSettingsList(chatProvider: Provider): SettingsListItem[] {
  const hasAnthropic = !!getApiKey("anthropic");
  const hasOpenAI = !!getApiKey("openai");
  const hasAnyKey = hasAnthropic || hasOpenAI;
  const models = chatProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

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

  // Action buttons
  items.push({
    item: { type: "action", action: "done" },
    enabled: true,
  });

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
): BoxRenderable {
  const container = new BoxRenderable(ctx, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    paddingLeft: 2,
    paddingRight: 2,
    paddingTop: 2,
    backgroundColor: COLORS.bg,
  });

  const items = getSettingsList(chatProvider);
  const currentModel = getModel(chatProvider);

  // Header
  const header = new TextRenderable(ctx, {
    content: "Settings",
    fg: COLORS.accent,
  });
  container.add(header);
  container.add(new BoxRenderable(ctx, { height: 1 }));

  // Provider section
  const providerHeader = new TextRenderable(ctx, {
    content: t`${bold("Provider")}`,
    fg: COLORS.textSecondary,
  });
  container.add(providerHeader);

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

    container.add(itemBox);
  }

  // Model section - only shown when there are model items
  const hasModelItems = items.some(item => item.item.type === "model");
  if (hasModelItems) {
    container.add(new BoxRenderable(ctx, { height: 1 }));

    const modelHeader = new TextRenderable(ctx, {
      content: t`${bold("Model")}`,
      fg: COLORS.textSecondary,
    });
    container.add(modelHeader);

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

      container.add(itemBox);
    }
  }

  // Telemetry section
  container.add(new BoxRenderable(ctx, { height: 1 }));

  const telemetryHeader = new TextRenderable(ctx, {
    content: t`${bold("Telemetry")}`,
    fg: COLORS.textSecondary,
  });
  container.add(telemetryHeader);

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

    container.add(itemBox);
  }

  container.add(new BoxRenderable(ctx, { height: 1 }));

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

    container.add(itemBox);
  }

  container.add(new BoxRenderable(ctx, { height: 2 }));

  const hint = new TextRenderable(ctx, {
    content: "↑/↓ navigate  Enter select  Esc back",
    fg: COLORS.textSecondary,
  });
  container.add(hint);

  return container;
}

export function navigateSettings(
  state: SettingsState,
  delta: number,
  chatProvider: Provider,
): void {
  const items = getSettingsList(chatProvider);
  const maxIndex = items.length - 1;
  state.selectedIndex = Math.max(0, Math.min(maxIndex, state.selectedIndex + delta));
}

export type SettingsAction =
  | { type: "switch_provider"; provider: Provider }
  | { type: "select_model"; modelId: string; provider: Provider }
  | { type: "add_anthropic" }
  | { type: "add_openai" }
  | { type: "clear_keys" }
  | { type: "toggle_telemetry" }
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

    case "action":
      switch (selected.item.action) {
        case "done":
          return { type: "done" };
        case "clear_keys":
          return { type: "clear_keys" };
      }
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
