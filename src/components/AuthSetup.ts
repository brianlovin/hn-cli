import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  type RenderContext,
} from "@opentui/core";
import { COLORS } from "../theme";
import type { Provider } from "../config";

export interface AuthSetupState {
  step: "provider" | "key";
  selectedProvider: Provider;
  keyInput: InputRenderable | null;
}

export interface AuthSetupCallbacks {
  onSaveKey: (provider: Provider, key: string) => void;
}

export function initAuthSetupState(): AuthSetupState {
  return {
    step: "provider",
    selectedProvider: "anthropic",
    keyInput: null,
  };
}

export function renderAuthSetup(
  ctx: RenderContext,
  state: AuthSetupState,
  callbacks: AuthSetupCallbacks,
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
    content: "Set up AI Chat",
    fg: COLORS.accent,
  });
  container.add(header);

  // Spacer
  container.add(new BoxRenderable(ctx, { height: 1 }));

  if (state.step === "provider") {
    renderProviderSelection(ctx, container, state);
  } else if (state.step === "key") {
    renderKeyInput(ctx, container, state, callbacks);
  }

  return container;
}

function renderProviderSelection(
  ctx: RenderContext,
  container: BoxRenderable,
  state: AuthSetupState,
): void {
  const prompt = new TextRenderable(ctx, {
    content: "Choose your AI provider:",
    fg: COLORS.text,
  });
  container.add(prompt);

  container.add(new BoxRenderable(ctx, { height: 1 }));

  // Anthropic option
  const anthropicBox = new BoxRenderable(ctx, {
    flexDirection: "row",
    gap: 1,
  });
  const anthropicDot = new TextRenderable(ctx, {
    content: state.selectedProvider === "anthropic" ? "\u25CF" : "\u25CB",
    fg:
      state.selectedProvider === "anthropic" ? COLORS.accent : COLORS.textDim,
  });
  const anthropicLabel = new TextRenderable(ctx, {
    content: "Anthropic",
    fg: state.selectedProvider === "anthropic" ? COLORS.accent : COLORS.text,
  });
  anthropicBox.add(anthropicDot);
  anthropicBox.add(anthropicLabel);
  container.add(anthropicBox);

  // OpenAI option
  const openaiBox = new BoxRenderable(ctx, {
    flexDirection: "row",
    gap: 1,
  });
  const openaiDot = new TextRenderable(ctx, {
    content: state.selectedProvider === "openai" ? "\u25CF" : "\u25CB",
    fg: state.selectedProvider === "openai" ? COLORS.accent : COLORS.textDim,
  });
  const openaiLabel = new TextRenderable(ctx, {
    content: "OpenAI",
    fg: state.selectedProvider === "openai" ? COLORS.accent : COLORS.text,
  });
  openaiBox.add(openaiDot);
  openaiBox.add(openaiLabel);
  container.add(openaiBox);

  container.add(new BoxRenderable(ctx, { height: 2 }));

  // Instructions
  const instructions = new TextRenderable(ctx, {
    content: "\u2191/\u2193 to select, Enter to continue, Esc to cancel",
    fg: COLORS.textDim,
  });
  container.add(instructions);
}

function renderKeyInput(
  ctx: RenderContext,
  container: BoxRenderable,
  state: AuthSetupState,
  callbacks: AuthSetupCallbacks,
): void {
  const providerName =
    state.selectedProvider === "anthropic" ? "Anthropic" : "OpenAI";
  const prompt = new TextRenderable(ctx, {
    content: `Enter your ${providerName} API key:`,
    fg: COLORS.text,
  });
  container.add(prompt);

  container.add(new BoxRenderable(ctx, { height: 1 }));

  // Input field
  const inputContainer = new BoxRenderable(ctx, {
    width: "100%",
    flexDirection: "row",
    gap: 1,
  });

  const inputPrompt = new TextRenderable(ctx, {
    content: "\u203A",
    fg: COLORS.accent,
  });
  inputContainer.add(inputPrompt);

  state.keyInput = new InputRenderable(ctx, {
    width: "100%",
    flexGrow: 1,
    placeholder: state.selectedProvider === "anthropic" ? "sk-ant-..." : "sk-...",
    backgroundColor: COLORS.bg,
  });

  state.keyInput.on("enter", () => {
    const apiKey = state.keyInput?.value.trim();
    if (apiKey) {
      callbacks.onSaveKey(state.selectedProvider, apiKey);
    }
  });

  inputContainer.add(state.keyInput);
  container.add(inputContainer);

  container.add(new BoxRenderable(ctx, { height: 2 }));

  // Security note
  const securityNote = new TextRenderable(ctx, {
    content: "Your key is stored locally at ~/.config/hn-cli/config.json",
    fg: COLORS.textDim,
    wrapMode: "word",
  });
  container.add(securityNote);

  container.add(new BoxRenderable(ctx, { height: 1 }));

  const repoNote = new TextRenderable(ctx, {
    content: "This app is open source: github.com/brianlovin/hn-cli",
    fg: COLORS.textDim,
    wrapMode: "word",
  });
  container.add(repoNote);

  container.add(new BoxRenderable(ctx, { height: 2 }));

  const instructions = new TextRenderable(ctx, {
    content: "Enter to save, Esc to cancel",
    fg: COLORS.textDim,
  });
  container.add(instructions);

  // Focus the input after a brief delay
  setTimeout(() => {
    if (state.keyInput) {
      state.keyInput.focus();
      state.keyInput.value = "";
    }
  }, 50);
}

export function navigateAuthProvider(state: AuthSetupState, delta: number): void {
  if (state.step !== "provider") return;
  state.selectedProvider = delta > 0 ? "openai" : "anthropic";
}

export function confirmAuthProvider(state: AuthSetupState): void {
  if (state.step === "provider") {
    state.step = "key";
  }
}
