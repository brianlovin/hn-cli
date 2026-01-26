# HN CLI

A terminal UI for browsing Hacker News, modeled after the HN reader on my [personal website](https://brianlovin.com/hn).

## Installation

```bash
# Run directly (no install needed)
bunx @brianlovin/hn-cli

# Or install globally
bun install -g @brianlovin/hn-cli
hn
```

### From source

```bash
git clone https://github.com/brianlovin/hn-cli.git
cd hn-cli
bun install
bun run start
```

## Usage

### Navigation

| Key       | Action                       |
| --------- | ---------------------------- |
| `j` / `k` | Navigate between stories     |
| `space`   | Jump to next root comment    |
| `o`       | Open story URL in browser    |
| `r`       | Refresh stories              |
| `c`       | Chat with AI about the story |
| `t`       | AI-generated tl;dr           |
| `s`       | Open settings                |

### Mouse Support

- Click on stories in the sidebar to select them
- Click story title/URL to open in browser

### AI Chat

Press `c` on any story to start a conversation with an AI about the story and its comments. The AI has full context of the story content and all comments.

#### Bring Your Own API Key

The chat feature requires an API key from either Anthropic or OpenAI. On first use, you'll be prompted to choose a provider and enter your key.

**Option 1: Environment variables**

```bash
# For Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# For OpenAI
export OPENAI_API_KEY=sk-...
```

**Option 2: In-app setup**

Press `c` to start a chat, and you'll be guided through the setup. Your key is stored locally at `~/.config/hn-cli/config.json`.

---

## Development

### Running locally

```bash
bun install          # Install dependencies
bun run start        # Run the app
bun run dev          # Run with hot reload
bun run dev:update   # Run with simulated update notification
```

### Testing the update notification

To test the update notification UI without publishing a new version:

```bash
bun run dev:update
```

You can also customize the simulated versions:

```bash
HN_SIMULATE_VERSION=0.2.0 HN_SIMULATE_LATEST=0.5.0 bun run start
```

### Testing

```bash
bun run test         # Run tests
bun run typecheck    # Check types
```

### Debug modes

```bash
bun run debug                      # Test long comment wrapping
bun run debug story-list           # Test story list view
bun run debug highlighted-comment  # Test comment highlighting
```

### Architecture

- `src/index.ts` - Entry point
- `src/app.ts` - Main app class with UI and keyboard handling
- `src/api.ts` - API client for fetching from HNPWA API
- `src/config.ts` - Configuration and API key management
- `src/settings.ts` - Configurable filter settings with validation
- `src/types.ts` - TypeScript types for HN data structures
- `src/test/` - Test suite

## Settings

Press `s` at any time to open the settings panel. Use `j`/`k` to navigate, `←`/`→` or `Enter` to adjust values, and `r` to reset all settings to defaults.

### AI Provider

- Switch between Anthropic and OpenAI
- Change the model (Claude Sonnet/Haiku, GPT-4o/4o-mini)
- Add or clear API keys

### Story Filtering

These settings control which stories appear in your feed:

| Setting      | Default | Description                                |
| ------------ | ------- | ------------------------------------------ |
| Max Stories  | 24      | Maximum number of stories to display       |
| Time Window  | 24h     | Only show stories from the last N hours    |
| Min Points   | 50      | Minimum upvotes required (OR min comments) |
| Min Comments | 20      | Minimum comments required (OR min points)  |

### Comment Display

| Setting        | Default | Description                                 |
| -------------- | ------- | ------------------------------------------- |
| Root Comments  | 12      | Maximum root-level comments shown per story |
| Child Comments | 8       | Maximum replies shown per comment           |
| Nesting Depth  | 3       | Maximum levels of nested replies            |

Settings are stored locally at `~/.config/hn-cli/config.json`.

## Design decisions

The default settings match my HN reader on my [personal website](https://brianlovin.com/hn). I made these choices so that it's easier for me to keep up with the most interesting stories throughout the day without getting sucked too deep into long comment threads or the flood of new submissions.

All defaults are now customizable via the settings panel (`s`).

## Telemetry

This CLI collects anonymous usage data to help understand how people use it and what features to improve. No personal information or content is ever collected.

### What's collected

- App launches (with version number)
- Feature usage counts (TLDR, chat, refresh)
- Navigation patterns (stories selected, comments viewed)
- Keyboard shortcut usage

### What's NOT collected

- Story content, titles, or URLs
- Chat messages or AI responses
- API keys or credentials
- IP addresses or location data

### Disabling telemetry

**Option 1: Settings menu**

Press `s` to open settings, then toggle "Telemetry" off.

**Option 2: Launch flag**

```bash
hn --disable-telemetry
```

This permanently disables telemetry. Your preference is stored locally at `~/.config/hn-cli/config.json`.

## Credits

Built with [OpenTUI](https://github.com/anthropics/opentui)
