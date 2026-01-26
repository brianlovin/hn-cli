import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import { COLORS } from "../theme";
import {
  type Provider,
  getApiKey,
  getModel,
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
} from "../config";

export interface SettingsItem {
  label: string;
  action: string;
  enabled: boolean;
}

export interface SettingsState {
  section: "main" | "model";
  selectedIndex: number;
  modelProvider: Provider;
}

export function initSettingsState(): SettingsState {
  return {
    section: "main",
    selectedIndex: 0,
    modelProvider: "anthropic",
  };
}

export function getSettingsItems(chatProvider: Provider): SettingsItem[] {
  const hasAnthropic = !!getApiKey("anthropic");
  const hasOpenAI = !!getApiKey("openai");

  const items: SettingsItem[] = [];

  // Provider selection
  items.push({
    label: `Provider: ${chatProvider === "anthropic" ? "Anthropic" : "OpenAI"}`,
    action: "switch_provider",
    enabled: hasAnthropic && hasOpenAI,
  });

  // Model selection for current provider
  const currentModel = getModel(chatProvider);
  const models =
    chatProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
  const modelName =
    models.find((m) => m.id === currentModel)?.name || currentModel;
  items.push({
    label: `Model: ${modelName}`,
    action: "change_model",
    enabled: true,
  });

  // Add API key
  if (!hasAnthropic) {
    items.push({
      label: "Add Anthropic API key",
      action: "add_anthropic",
      enabled: true,
    });
  }
  if (!hasOpenAI) {
    items.push({
      label: "Add OpenAI API key",
      action: "add_openai",
      enabled: true,
    });
  }

  // Clear tokens
  if (hasAnthropic || hasOpenAI) {
    items.push({
      label: "Clear all API keys",
      action: "clear_keys",
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

  // Header
  const header = new TextRenderable(ctx, {
    content: "Settings",
    fg: COLORS.accent,
  });
  container.add(header);

  container.add(new BoxRenderable(ctx, { height: 1 }));

  if (state.section === "main") {
    renderMainSection(ctx, container, state, chatProvider);
  } else if (state.section === "model") {
    renderModelSection(ctx, container, state);
  }

  return container;
}

function renderMainSection(
  ctx: RenderContext,
  container: BoxRenderable,
  state: SettingsState,
  chatProvider: Provider,
): void {
  const items = getSettingsItems(chatProvider);

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;

    const isSelected = index === state.selectedIndex;
    const itemBox = new BoxRenderable(ctx, {
      flexDirection: "row",
      gap: 1,
    });

    const indicator = new TextRenderable(ctx, {
      content: isSelected ? "\u203A" : " ",
      fg: COLORS.accent,
    });
    itemBox.add(indicator);

    const label = new TextRenderable(ctx, {
      content: item.label,
      fg: isSelected
        ? COLORS.accent
        : item.enabled
          ? COLORS.text
          : COLORS.textDim,
    });
    itemBox.add(label);

    container.add(itemBox);
  }

  container.add(new BoxRenderable(ctx, { height: 2 }));

  const hint = new TextRenderable(ctx, {
    content: "\u2191/\u2193 navigate  Enter select  Esc back",
    fg: COLORS.textDim,
  });
  container.add(hint);
}

function renderModelSection(
  ctx: RenderContext,
  container: BoxRenderable,
  state: SettingsState,
): void {
  const models =
    state.modelProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
  const currentModel = getModel(state.modelProvider);

  const subtitle = new TextRenderable(ctx, {
    content: `Select ${state.modelProvider === "anthropic" ? "Anthropic" : "OpenAI"} model:`,
    fg: COLORS.text,
  });
  container.add(subtitle);

  container.add(new BoxRenderable(ctx, { height: 1 }));

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    if (!model) continue;

    const isSelected = index === state.selectedIndex;
    const isCurrent = model.id === currentModel;
    const itemBox = new BoxRenderable(ctx, {
      flexDirection: "row",
      gap: 1,
    });

    const indicator = new TextRenderable(ctx, {
      content: isSelected ? "\u203A" : " ",
      fg: COLORS.accent,
    });
    itemBox.add(indicator);

    const dot = new TextRenderable(ctx, {
      content: isCurrent ? "\u25CF" : "\u25CB",
      fg: isCurrent ? COLORS.accent : COLORS.textDim,
    });
    itemBox.add(dot);

    const label = new TextRenderable(ctx, {
      content: model.name,
      fg: isSelected ? COLORS.accent : COLORS.text,
    });
    itemBox.add(label);

    container.add(itemBox);
  }

  container.add(new BoxRenderable(ctx, { height: 2 }));

  const hint = new TextRenderable(ctx, {
    content: "\u2191/\u2193 navigate  Enter select  Esc back",
    fg: COLORS.textDim,
  });
  container.add(hint);
}

export function navigateSettings(
  state: SettingsState,
  delta: number,
  chatProvider: Provider,
): void {
  let maxIndex: number;

  if (state.section === "main") {
    maxIndex = getSettingsItems(chatProvider).length - 1;
  } else {
    const models =
      state.modelProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
    maxIndex = models.length - 1;
  }

  state.selectedIndex = Math.max(
    0,
    Math.min(maxIndex, state.selectedIndex + delta),
  );
}

export type SettingsAction =
  | { type: "switch_provider" }
  | { type: "change_model"; provider: Provider }
  | { type: "add_anthropic" }
  | { type: "add_openai" }
  | { type: "clear_keys" }
  | { type: "select_model"; modelId: string; provider: Provider }
  | { type: "back_to_main" }
  | null;

export function selectSettingsItem(
  state: SettingsState,
  chatProvider: Provider,
): SettingsAction {
  if (state.section === "main") {
    const items = getSettingsItems(chatProvider);
    const selected = items[state.selectedIndex];
    if (!selected || !selected.enabled) return null;

    switch (selected.action) {
      case "switch_provider":
        return { type: "switch_provider" };

      case "change_model":
        state.section = "model";
        state.modelProvider = chatProvider;
        state.selectedIndex = 0;
        return { type: "change_model", provider: chatProvider };

      case "add_anthropic":
        return { type: "add_anthropic" };

      case "add_openai":
        return { type: "add_openai" };

      case "clear_keys":
        return { type: "clear_keys" };
    }
  } else if (state.section === "model") {
    const models =
      state.modelProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
    const selected = models[state.selectedIndex];
    if (selected) {
      state.section = "main";
      state.selectedIndex = 1; // Back to model item
      return {
        type: "select_model",
        modelId: selected.id,
        provider: state.modelProvider,
      };
    }
  }

  return null;
}

export function goBackInSettings(state: SettingsState): boolean {
  if (state.section === "model") {
    state.section = "main";
    state.selectedIndex = 0;
    return true; // Handled, stay in settings
  }
  return false; // Not handled, exit settings
}
