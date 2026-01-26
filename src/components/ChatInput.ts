import {
  BoxRenderable,
  TextRenderable,
  TextareaRenderable,
  type RenderContext,
} from "@opentui/core";
import { COLORS } from "../theme";

export interface ChatInputCallbacks {
  onSubmit: () => void;
}

export interface ChatInputState {
  container: BoxRenderable;
  input: TextareaRenderable;
}

export function createChatInput(
  ctx: RenderContext,
  callbacks: ChatInputCallbacks,
): ChatInputState {
  const container = new BoxRenderable(ctx, {
    width: "100%",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 2,
    paddingRight: 2,
    backgroundColor: COLORS.bg,
    borderStyle: "single",
    border: ["top"],
    borderColor: COLORS.border,
  });

  const promptLabel = new TextRenderable(ctx, {
    content: "\u203A  ",
    fg: COLORS.accent,
  });
  container.add(promptLabel);

  const input = new TextareaRenderable(ctx, {
    width: "100%",
    flexGrow: 1,
    minHeight: 1,
    maxHeight: 5,
    wrapMode: "word",
    placeholder: "Ask a question about this story...",
    backgroundColor: COLORS.bg,
    keyBindings: [
      // Shift+Enter for new line (must be before plain return to match first)
      { name: "return", shift: true, action: "newline" },
      // Enter to submit
      { name: "return", action: "submit" },
    ],
  });

  input.on("submit", () => {
    callbacks.onSubmit();
  });

  container.add(input);

  return { container, input };
}
