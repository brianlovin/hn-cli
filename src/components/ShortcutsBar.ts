import { BoxRenderable, TextRenderable, type RenderContext, t, fg, underline } from "@opentui/core";
import { COLORS } from "../theme";

export interface ShortcutItem {
  key: string;
  desc: string;
  rightAlign?: boolean;
}

// Check if a key can be shown inline (single letter that starts the description)
function canShowInline(key: string, desc: string): boolean {
  return key.length === 1 && desc.length > 0 && desc.toLowerCase().startsWith(key.toLowerCase());
}

export function createShortcutsBar(
  ctx: RenderContext,
  shortcuts: ShortcutItem[],
): BoxRenderable {
  const bar = new BoxRenderable(ctx, {
    width: "100%",
    height: 2,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 2,
    paddingRight: 2,
    backgroundColor: COLORS.bg,
    borderStyle: "single",
    border: ["top"],
    borderColor: COLORS.border,
    gap: 2,
  });

  // Split shortcuts into left and right groups
  const leftShortcuts = shortcuts.filter(s => !s.rightAlign);
  const rightShortcuts = shortcuts.filter(s => s.rightAlign);

  const renderShortcut = (item: ShortcutItem) => {
    const { key, desc } = item;
    if (canShowInline(key, desc)) {
      // Show inline: first letter white + underlined, rest normal
      const firstChar = desc[0] ?? "";
      const text = new TextRenderable(ctx, {
        content: t`${underline(fg(COLORS.textPrimary)(firstChar))}${desc.slice(1)}`,
        fg: COLORS.textSecondary,
      });
      bar.add(text);
    } else {
      // Show key + desc separately
      const shortcut = new BoxRenderable(ctx, {
        flexDirection: "row",
        gap: 1,
      });

      const keyText = new TextRenderable(ctx, {
        content: key,
        fg: COLORS.textPrimary,
      });

      const descText = new TextRenderable(ctx, {
        content: desc,
        fg: COLORS.textSecondary,
      });

      shortcut.add(keyText);
      shortcut.add(descText);
      bar.add(shortcut);
    }
  };

  // Render left-aligned shortcuts
  for (const item of leftShortcuts) {
    renderShortcut(item);
  }

  // Add spacer to push right-aligned items to the right
  if (rightShortcuts.length > 0) {
    const spacer = new BoxRenderable(ctx, { flexGrow: 1 });
    bar.add(spacer);

    // Render right-aligned shortcuts
    for (const item of rightShortcuts) {
      renderShortcut(item);
    }
  }

  return bar;
}

// Shortcuts shown in the story detail panel (bottom bar)
export const DETAIL_SHORTCUTS: ShortcutItem[] = [
  { key: "␣", desc: "next" },
  { key: "o", desc: "open" },
  { key: "c", desc: "chat" },
  { key: "s", desc: "settings", rightAlign: true },
];

// Shortcuts shown at the bottom of the story list
export const STORY_LIST_SHORTCUTS: ShortcutItem[] = [
  { key: "j/k", desc: "navigate" },
];

export const CHAT_SHORTCUTS: ShortcutItem[] = [
  { key: "/", desc: "commands" },
  { key: "esc", desc: "close", rightAlign: true },
];

export const SETTINGS_SHORTCUTS: ShortcutItem[] = [
  { key: "j/k", desc: "navigate" },
  { key: "←/→", desc: "adjust" },
  { key: "↵", desc: "select" },
  { key: "r", desc: "reset" },
  { key: "esc", desc: "close", rightAlign: true },
];

// Legacy export for backward compatibility
export const MAIN_SHORTCUTS = DETAIL_SHORTCUTS;
