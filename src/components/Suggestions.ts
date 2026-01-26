import { BoxRenderable, TextRenderable, type RenderContext } from "@opentui/core";
import { COLORS } from "../theme";
import { LOADING_CHARS } from "../utils";

export interface SuggestionsState {
  container: BoxRenderable;
  suggestions: string[];
  originalSuggestions: string[];
  selectedIndex: number;
  loading: boolean;
  loadingFrame: number;
}

export function createSuggestionsContainer(ctx: RenderContext): BoxRenderable {
  return new BoxRenderable(ctx, {
    id: "suggestions-container",
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    paddingLeft: 2,
    paddingRight: 2,
    paddingTop: 1,
    paddingBottom: 1,
    backgroundColor: COLORS.bg,
    borderStyle: "single",
    border: ["top"],
    borderColor: COLORS.border,
  });
}

export function renderSuggestions(
  ctx: RenderContext,
  state: SuggestionsState,
): void {
  if (!state.container) return;

  // Clear existing content
  for (const child of state.container.getChildren()) {
    state.container.remove(child.id);
  }

  // Determine if we have content to show
  const hasContent = state.loading || state.suggestions.length > 0;

  // Hide container styling when empty (no border, no padding)
  const container = state.container as any;
  if (hasContent) {
    container.paddingTop = 1;
    container.paddingBottom = 1;
    container.border = ["top"];
  } else {
    container.paddingTop = 0;
    container.paddingBottom = 0;
    container.border = [];
  }

  // Show loading state
  if (state.loading) {
    const loadingText = new TextRenderable(ctx, {
      id: "suggestions-loading",
      content: `${LOADING_CHARS[state.loadingFrame] ?? "\u280B"} Generating suggestions...`,
      fg: COLORS.textSecondary,
    });
    state.container.add(loadingText);
    return;
  }

  // No suggestions to show
  if (state.suggestions.length === 0) return;

  // Add header with star icon for consistent keyline
  const header = new TextRenderable(ctx, {
    id: "suggestions-header",
    content: "\u2726 Suggested questions",
    fg: COLORS.textTertiary,
  });
  state.container.add(header);

  // Add gap after header
  const spacer = new BoxRenderable(ctx, {
    id: "suggestions-spacer",
    height: 1,
  });
  state.container.add(spacer);

  // Render each suggestion in a BoxRenderable row
  for (let index = 0; index < state.suggestions.length; index++) {
    const suggestion = state.suggestions[index];
    if (!suggestion) continue;

    const isSelected = index === state.selectedIndex;

    // Row container
    const row = new BoxRenderable(ctx, {
      id: `suggestion-row-${index}`,
      width: "100%",
      flexDirection: "row",
      backgroundColor: COLORS.bg,
    });

    // Indicator: chevron when selected, bullet dot when not
    const indicator = new TextRenderable(ctx, {
      id: `suggestion-indicator-${index}`,
      content: isSelected ? "\u203A " : "\u2022 ",
      fg: isSelected ? COLORS.accent : COLORS.textSecondary,
      width: 2,
      flexShrink: 0,
    });
    row.add(indicator);

    // Text container allows hint to flow naturally after text
    const textContainer = new BoxRenderable(ctx, {
      id: `suggestion-text-container-${index}`,
      flexGrow: 1,
      flexDirection: "row",
      flexWrap: "wrap",
    });

    // Suggestion text
    const text = new TextRenderable(ctx, {
      id: `suggestion-text-${index}`,
      content: suggestion,
      fg: isSelected ? COLORS.accent : COLORS.textSecondary,
      wrapMode: "word",
    });
    textContainer.add(text);

    // Show hint for selected suggestion (flows after text)
    if (isSelected) {
      const hint = new TextRenderable(ctx, {
        id: `suggestion-hint-${index}`,
        content: " tab to type",
        fg: COLORS.textTertiary,
      });
      textContainer.add(hint);
    }

    row.add(textContainer);
    state.container.add(row);
  }
}

export function navigateSuggestion(
  state: SuggestionsState,
  delta: number,
): void {
  if (state.suggestions.length === 0) return;

  const newIndex = state.selectedIndex + delta;
  state.selectedIndex = Math.max(
    0,
    Math.min(state.suggestions.length - 1, newIndex),
  );
}

export function initSuggestionsState(container: BoxRenderable): SuggestionsState {
  return {
    container,
    suggestions: [],
    originalSuggestions: [],
    selectedIndex: -1,
    loading: false,
    loadingFrame: 0,
  };
}
