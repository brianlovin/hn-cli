---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# HN CLI - Hacker News Terminal Application

Interactive terminal UI for browsing Hacker News using OpenTUI.

## Running

```sh
bun run start    # Run the app
bun run test     # Run tests
bun run typecheck # Check types
```

## Keyboard Shortcuts

- `j/k` - Navigate between stories
- `⌘j/⌘k` - Navigate between root-level comments
- `o` - Open story URL in browser
- `⌘o` - Open story on brianlovin.com/hn
- `r` - Refresh stories
- `q` - Quit

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

## Data Rules (matching briOS website)

- Only shows posts from the last 24 hours
- Only shows "link" type posts (excludes jobs, polls)
- Minimum engagement: 50+ points OR 20+ comments
- Ranked by: points + (comments × 0.75) + recency bonus
- Maximum 24 posts displayed
- Comments: max 12 root, max 8 children per parent, max 3 levels deep

## Architecture

- `src/types.ts` - TypeScript types for HN data structures
- `src/api.ts` - API client for fetching from HNPWA API
- `src/app.ts` - Main app class (testable)
- `src/index.ts` - Entry point
- `src/test/` - Test suite using OpenTUI testing framework

## Dependencies

- `@opentui/core` - Terminal UI framework with Yoga layout engine

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
