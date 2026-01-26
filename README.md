# hn-cli

A terminal UI for browsing Hacker News, modeled after the HN reader on my [personal website](https://brianlovin.com/hn).

## Installation

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Clone the repository
git clone https://github.com/brianlovin/hn-cli.git
cd hn-cli

# Install dependencies
bun install

# Run the app
bun run start
```

## Usage

### Navigation

| Key         | Action                               |
| ----------- | ------------------------------------ |
| `j` / `k`   | Navigate between stories             |
| `⌘j` / `⌘k` | Navigate between root-level comments |
| `o`         | Open story URL in browser            |
| `c`         | Chat with AI about the story         |
| `r`         | Refresh stories                      |
| `q`         | Quit                                 |

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

**Settings**

While in chat mode, press `,` to access settings where you can:

- Switch between Anthropic and OpenAI
- Change the model
- Add additional API keys
- Clear stored keys

---

## Development

### Running locally

```bash
bun install          # Install dependencies
bun run start        # Run the app
bun run dev          # Run with hot reload
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
- `src/types.ts` - TypeScript types for HN data structures
- `src/test/` - Test suite

## Design decisions

This CLI matches the implementation of my HN reader on my [personal website](https://brianlovin.com/hn):

- Only shows posts from the last 24 hours
- Only shows "link" type posts (excludes jobs, polls)
- Requires minimum story engagement: 50+ points OR 20+ comments
- Ranked by: points + (comments × 0.75) + recency bonus
- Maximum 24 posts displayed
- Comments: max 12 root comments, max 8 children per parent, max 3 levels deep

I made these choices so that it's easier for me to keep up with the most interesting stories throughout the day without getting sucked too deep into long comment threads or the flood of new submissions.

If you want your version of this tool to work differently, feel free to clone or consider opening a PR with more advanced settings to let people customize the default experience.

## Credits

Built with [OpenTUI](https://github.com/anthropics/opentui)
