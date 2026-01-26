---
name: OpenTUI
description: Build terminal UIs with OpenTUI, a TypeScript library using Yoga-powered flexbox layout. Use when creating terminal applications, working with Text/Box/Input/Select/ScrollBox components, handling keyboard input, or writing OpenTUI tests.
---

# OpenTUI Development Guide

OpenTUI is a TypeScript library for building terminal user interfaces. It requires Bun as the runtime.

## Installation

```bash
bun add @opentui/core
```

Or with React bindings:

```bash
bun add @opentui/react @opentui/core react
```

## Core Concepts

### Two APIs: Renderables vs Constructs

**Renderables** - Direct class instantiation with full control:
```typescript
const text = new TextRenderable(renderer, {
  id: "greeting",
  content: "Hello!",
  fg: "#00FF00",
});
```

**Constructs** - Functional composition (simpler syntax):
```typescript
Text({ content: "Hello!", fg: "#00FF00" })
```

### Layout System

OpenTUI uses Yoga (flexbox) for layout. Key properties:

- `flexDirection`: "row" | "column"
- `justifyContent`: "flex-start" | "center" | "flex-end" | "space-between" | "space-around"
- `alignItems`: "flex-start" | "center" | "flex-end" | "stretch"
- `width` / `height`: number or percentage string ("50%")
- `padding` / `gap`: spacing in cells
- `flexGrow`: number for proportional sizing

### Colors

Use hex strings ("#FF0000") or RGBA values ({ r: 255, g: 0, b: 0, a: 255 }).

## Components

### Text
Display styled text with colors and attributes.

```typescript
import { Text, t, bold, fg, italic } from "@opentui/core";

// Simple text
Text({ content: "Hello", fg: "#00FF00" })

// Rich text with template literals
Text({ content: t`${bold(fg("#FFFF00")("bold yellow"))} and ${italic("italic")}` })
```

**Text Attributes**: BOLD, DIM, ITALIC, UNDERLINE, BLINK, INVERSE, HIDDEN, STRIKETHROUGH (combine with bitwise OR)

### Box
Container with borders and layout.

```typescript
import { Box } from "@opentui/core";

Box({
  border: "rounded",  // "single" | "double" | "rounded" | "heavy" | false
  title: "Panel Title",
  titleAlign: "center",  // "left" | "center" | "right"
  padding: 1,
  flexDirection: "column",
  gap: 1,
},
  Text({ content: "Child 1" }),
  Text({ content: "Child 2" })
)
```

### Input
Text input field requiring focus.

```typescript
import { InputRenderable, InputEvent } from "@opentui/core";

const input = new InputRenderable(renderer, {
  width: 30,
  placeholder: "Type here...",
  backgroundColor: "#333333",
  focusedBackgroundColor: "#444444",
});

input.on(InputEvent.INPUT, () => console.log(input.value));
input.on(InputEvent.ENTER, () => handleSubmit(input.value));
```

### Select
Vertical selection list requiring focus.

```typescript
import { SelectRenderable, SelectEvent } from "@opentui/core";

const select = new SelectRenderable(renderer, {
  options: [
    { name: "Option 1", description: "First option", value: "opt1" },
    { name: "Option 2", description: "Second option", value: "opt2" },
  ],
  wrapSelection: true,
});

select.on(SelectEvent.ITEM_SELECTED, (index, option) => {
  console.log(`Selected: ${option.value}`);
});
```

**Keyboard**: j/Down (next), k/Up (prev), Shift+Up/Down (fast scroll), Enter (select)

### ScrollBox
Scrollable container for long content.

```typescript
import { ScrollBoxRenderable } from "@opentui/core";

const scrollbox = new ScrollBoxRenderable(renderer, {
  scrollY: true,
  stickyScroll: "bottom",  // Keeps view anchored to bottom
  viewportCulling: true,   // Only render visible children (performance)
});

scrollbox.scrollBy({ y: 10, unit: "line" });
scrollbox.scrollTo({ x: 0, y: 100 });
```

**Keyboard** (when focused): Arrow keys (line), Page Up/Down (viewport), Home/End (boundaries)

### Code
Syntax-highlighted code display with Tree-sitter.

```typescript
import { CodeRenderable, SyntaxStyle } from "@opentui/core";

const code = new CodeRenderable(renderer, {
  content: 'console.log("Hello");',
  filetype: "typescript",
  syntaxStyle: SyntaxStyle.fromStyles({ keyword: { fg: "#FF79C6" } }),
  streaming: true,  // For incremental updates (LLM output)
  selectable: true,
});
```

## React Integration

```typescript
// tsconfig.json: "jsx": "react-jsx", "jsxImportSource": "@opentui/react"

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";

const renderer = createCliRenderer();
const root = createRoot(renderer);

function App() {
  const { width, height } = useTerminalDimensions();

  useKeyboard((event) => {
    if (event.key === "q") process.exit(0);
  });

  return <box border="rounded"><text>Terminal: {width}x{height}</text></box>;
}

root.render(<App />);
```

**Available hooks**: useRenderer(), useKeyboard(), useOnResize(), useTerminalDimensions(), useTimeline()

## Testing

Use `@opentui/core/testing` for headless testing:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";

describe("MyApp", () => {
  let renderer, mockInput, mockMouse, renderOnce, captureCharFrame;

  beforeEach(async () => {
    const ctx = await createTestRenderer({
      width: 80,
      height: 24,
      kittyKeyboard: true,
    });
    renderer = ctx.renderer;
    mockInput = ctx.mockInput;
    mockMouse = ctx.mockMouse;
    renderOnce = ctx.renderOnce;
    captureCharFrame = ctx.captureCharFrame;
  });

  afterEach(async () => {
    await renderer.idle();
    renderer.destroy();
  });

  it("should handle keyboard input", async () => {
    // Render initial state
    await renderOnce();

    // Simulate keypress
    mockInput.pressKey("j");
    await renderOnce();

    // Capture rendered output
    const frame = captureCharFrame();
    expect(frame).toContain("expected text");
  });

  it("should handle mouse clicks", async () => {
    await mockMouse.click(10, 5);
    await renderOnce();
  });

  it("should handle modifier keys", async () => {
    mockInput.pressKey("j", { super: true });  // Cmd+J
    mockInput.pressKey("k", { ctrl: true });   // Ctrl+K
    mockInput.pressEnter();
    await renderOnce();
  });
});
```

## Best Practices

1. **Use `await renderOnce()`** after state changes to ensure rendering completes before assertions

2. **Use `renderer.idle()`** in afterEach to wait for pending async operations

3. **Structure components hierarchically** - Box containers for layout, Text for content

4. **Manage focus explicitly** - Input and Select require focus to receive keyboard input

5. **Use sticky scroll** for chat-like interfaces where new content appears at bottom

6. **Enable viewport culling** on ScrollBox with many children for performance

7. **Prefer Renderables** for stateful components needing direct control, **Constructs** for simple composition

## Documentation Links

- Getting Started: https://opentui.com/docs/getting-started/
- Box Component: https://opentui.com/docs/components/box/
- Text Component: https://opentui.com/docs/components/text/
- Input Component: https://opentui.com/docs/components/input/
- Select Component: https://opentui.com/docs/components/select/
- ScrollBox Component: https://opentui.com/docs/components/scrollbox/
- Code Component: https://opentui.com/docs/components/code/
- React Integration: https://opentui.com/docs/bindings/react/
- GitHub Repository: https://github.com/anomalyco/opentui
