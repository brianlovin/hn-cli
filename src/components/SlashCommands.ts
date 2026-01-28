import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import { COLORS } from "../theme";

export interface SlashCommand {
  name: string;
  description: string;
  handler: () => void;
}

export interface SlashCommandsState {
  container: BoxRenderable;
  commands: SlashCommand[];
  filteredCommands: SlashCommand[];
  selectedIndex: number;
  isVisible: boolean;
  query: string; // Current filter query (after "/")
}

export function createSlashCommandsContainer(ctx: RenderContext): BoxRenderable {
  return new BoxRenderable(ctx, {
    id: "slash-commands-container",
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    paddingLeft: 2,
    paddingRight: 2,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: COLORS.bg,
    borderStyle: "single",
    border: [],
    borderColor: COLORS.border,
  });
}

export function initSlashCommandsState(
  container: BoxRenderable,
  commands: SlashCommand[],
): SlashCommandsState {
  return {
    container,
    commands,
    filteredCommands: [...commands],
    selectedIndex: commands.length - 1, // Start at bottom (nearest to input)
    isVisible: false,
    query: "",
  };
}

export function filterCommands(state: SlashCommandsState, query: string): void {
  state.query = query;
  const lowerQuery = query.toLowerCase();

  if (!lowerQuery) {
    state.filteredCommands = [...state.commands];
  } else {
    state.filteredCommands = state.commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.description.toLowerCase().includes(lowerQuery),
    );
  }

  // Select the last item (nearest to input) or -1 if no matches
  state.selectedIndex =
    state.filteredCommands.length > 0 ? state.filteredCommands.length - 1 : -1;
}

export function navigateSlashCommands(state: SlashCommandsState, delta: number): void {
  if (state.filteredCommands.length === 0) return;

  const newIndex = state.selectedIndex + delta;
  state.selectedIndex = Math.max(
    0,
    Math.min(state.filteredCommands.length - 1, newIndex),
  );
}

export function renderSlashCommands(
  ctx: RenderContext,
  state: SlashCommandsState,
): void {
  if (!state.container) return;

  // Clear existing content
  for (const child of state.container.getChildren()) {
    state.container.remove(child.id);
  }

  // Hide container styling when not visible
  const container = state.container as any;
  if (!state.isVisible || state.filteredCommands.length === 0) {
    container.paddingTop = 0;
    container.paddingBottom = 0;
    container.border = [];
    return;
  }

  container.paddingTop = 0;
  container.paddingBottom = 0;
  container.border = ["top"];

  // Render each command (in natural order - lowest index at top, highest at bottom)
  for (let index = 0; index < state.filteredCommands.length; index++) {
    const cmd = state.filteredCommands[index];
    if (!cmd) continue;

    const isSelected = index === state.selectedIndex;

    // Row container
    const row = new BoxRenderable(ctx, {
      id: `slash-command-row-${index}`,
      width: "100%",
      flexDirection: "row",
      backgroundColor: COLORS.bg,
    });

    // Indicator: chevron when selected, space when not
    const indicator = new TextRenderable(ctx, {
      id: `slash-command-indicator-${index}`,
      content: isSelected ? "› " : "  ",
      fg: isSelected ? COLORS.accent : COLORS.textSecondary,
      width: 2,
      flexShrink: 0,
    });
    row.add(indicator);

    // Command name with "/" prefix
    const nameText = new TextRenderable(ctx, {
      id: `slash-command-name-${index}`,
      content: `/${cmd.name}`,
      fg: isSelected ? COLORS.accent : COLORS.textPrimary,
    });
    row.add(nameText);

    // Description
    const descText = new TextRenderable(ctx, {
      id: `slash-command-desc-${index}`,
      content: ` — ${cmd.description}`,
      fg: COLORS.textSecondary,
    });
    row.add(descText);

    state.container.add(row);
  }
}

export function getSelectedCommand(state: SlashCommandsState): SlashCommand | null {
  if (state.selectedIndex < 0 || state.selectedIndex >= state.filteredCommands.length) {
    return null;
  }
  return state.filteredCommands[state.selectedIndex] ?? null;
}

export function showSlashCommands(state: SlashCommandsState): void {
  state.isVisible = true;
  state.query = "";
  state.filteredCommands = [...state.commands];
  state.selectedIndex = state.commands.length - 1;
}

export function hideSlashCommands(state: SlashCommandsState): void {
  state.isVisible = false;
  state.query = "";
  state.filteredCommands = [...state.commands];
  state.selectedIndex = state.commands.length - 1;
}
