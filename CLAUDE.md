---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# HN CLI - Hacker News Terminal Application

Interactive terminal UI for browsing Hacker News using OpenTUI.

## Running

```sh
bun run start      # Run the app
bun run dev        # Run with watch mode
bun run dev:update # Run with simulated update notification
bun run test       # Run tests
bun run typecheck  # Check types
```

## Keyboard Shortcuts

- `j/k` - Navigate between stories
- `space` - Navigate to next root-level comment
- `o` - Open story URL in browser
- `⌘o` - Open story on brianlovin.com/hn
- `r` - Refresh stories
- `t` - Generate AI TLDR summary
- `c` - Chat about story
- `s` - Open settings

### Settings Panel Shortcuts

- `j/k` - Navigate between settings
- `←/→` - Decrease/increase setting value
- `↵` - Select or increase value
- `r` - Reset all settings to defaults
- `esc` - Close settings

## Mouse Support

- Click on stories in the left sidebar to select them
- Hover highlighting on story items
- Click story title or URL in detail view to open
- Click time/comments to open on brianlovin.com/hn

## Debug Commands

```sh
bun run debug              # Test long comment wrapping
bun run debug story-list   # Test story list view
bun run debug highlighted-comment # Test comment highlighting
```

## Development

To test the update notification UI without publishing a new version:

```sh
bun run dev:update
```

This simulates running v0.1.0 with v0.3.0 available, showing the update banner in the header. You can customize the versions with environment variables:

```sh
HN_SIMULATE_VERSION=0.2.0 HN_SIMULATE_LATEST=0.5.0 bun run start
```

## Data Rules (configurable defaults matching briOS website)

These are the default values, all configurable via the settings panel (`s`):

- Only shows posts from the last 24 hours (`hoursWindow`)
- Only shows "link" type posts (excludes jobs, polls) - not configurable
- Minimum engagement: 50+ points OR 20+ comments (`minPoints`, `minComments`)
- Ranked by: points + (comments × `commentWeight`) + recency bonus
- Maximum 24 posts displayed (`maxPosts`)
- Comments: max 12 root (`maxRootComments`), max 8 children per parent (`maxChildComments`), max 3 levels deep (`maxCommentLevel`)

## Architecture

- `src/types.ts` - TypeScript types for HN data structures
- `src/api.ts` - API client for fetching from HNPWA API
- `src/app.ts` - Main app class (testable)
- `src/index.ts` - Entry point
- `src/settings.ts` - Configurable filter settings with validation and persistence
- `src/telemetry.ts` - Anonymous usage telemetry
- `src/components/SettingsPanel.ts` - Settings UI panel with scrollable categories
- `src/test/` - Test suite using OpenTUI testing framework

## Settings System

The settings system (`src/settings.ts`) provides configurable filter settings:

### FilterSettings Interface

```ts
interface FilterSettings {
  // Story filtering
  maxPosts: number;           // Max stories to display (1-50, default: 24)
  fetchLimit: number;         // Posts to fetch from API (50-500, default: 200)
  hoursWindow: number;        // Time window in hours (1-168, default: 24)
  minPoints: number;          // Min points threshold (0-500, default: 50)
  minComments: number;        // Min comments threshold (0-100, default: 20)

  // Ranking algorithm
  commentWeight: number;      // Comment weight in ranking (0-2, default: 0.75)
  recencyBonusMax: number;    // Max recency bonus (0-200, default: 100)

  // Comment display
  maxRootComments: number;    // Root comments per story (1-50, default: 12)
  maxChildComments: number;   // Child comments per parent (1-20, default: 8)
  maxCommentLevel: number;    // Max nesting depth (1-10, default: 3)

  // Cache
  storiesTtlMinutes: number;  // Cache TTL in minutes (1-60, default: 5)
}
```

### Key Functions

- `loadSettings()` - Load settings from config, with defaults for missing values
- `saveSettings(settings)` - Save settings to config with validation
- `updateSetting(key, value)` - Update a single setting
- `resetSettings()` - Reset all settings to defaults
- `validateSetting(key, value)` - Validate and clamp a value to its allowed range

### UI Categories

Settings are organized into categories in the UI:
- **Story Filtering**: maxPosts, hoursWindow, minPoints, minComments
- **Comments**: maxRootComments, maxChildComments, maxCommentLevel

Advanced settings (commentWeight, recencyBonusMax, fetchLimit, storiesTtlMinutes) are hidden from the UI but still configurable via config.json.

### Auto-Refresh Behavior

When closing the settings panel, the app detects if any settings affecting the story list changed and automatically refreshes stories if needed.

## Telemetry

Anonymous usage telemetry is enabled by default. Disable with:
- Settings menu (`s`) → toggle Telemetry off
- `hn --disable-telemetry` flag (permanently disables)

## Dependencies

- `@opentui/core` - Terminal UI framework with Yoga layout engine

## Publishing to npm

Published as `@brianlovin/hn-cli`. To release a new version:

```sh
npm version patch   # or minor/major
git push origin main --tags
gh release create v0.x.x --generate-notes
```

The GitHub Action will automatically build, test, and publish to npm when a release is created.

---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
