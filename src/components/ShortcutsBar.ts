import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import { COLORS } from "../theme";

export interface ShortcutItem {
  key: string;
  desc: string;
}

export function createShortcutsBar(
  ctx: RenderContext,
  shortcuts: ShortcutItem[],
): BoxRenderable {
  const bar = new BoxRenderable(ctx, {
    width: "100%",
    height: 3,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 2,
    paddingRight: 2,
    paddingBottom: 1,
    backgroundColor: COLORS.bg,
    borderStyle: "single",
    border: ["top"],
    borderColor: COLORS.border,
    gap: 2,
  });

  for (const { key, desc } of shortcuts) {
    const shortcut = new BoxRenderable(ctx, {
      flexDirection: "row",
      gap: 1,
    });

    const keyText = new TextRenderable(ctx, {
      content: key,
      fg: COLORS.accent,
    });

    const descText = new TextRenderable(ctx, {
      content: desc,
      fg: COLORS.textDim,
    });

    shortcut.add(keyText);
    shortcut.add(descText);
    bar.add(shortcut);
  }

  return bar;
}

export const MAIN_SHORTCUTS: ShortcutItem[] = [
  { key: "j/k", desc: "stories" },
  { key: "\u2318j/k", desc: "comments" },
  { key: "o", desc: "open" },
  { key: "c", desc: "chat" },
  { key: "q", desc: "quit" },
];

export const CHAT_SHORTCUTS: ShortcutItem[] = [
  { key: ",", desc: "settings" },
  { key: "esc", desc: "close" },
];
