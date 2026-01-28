# Data Rules

Default filter values matching briOS website. All configurable via settings panel (`s`).

## Story Filtering

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `maxPosts` | 24 | 1-50 | Max stories to display |
| `fetchLimit` | 200 | 50-500 | Posts to fetch from API |
| `hoursWindow` | 24 | 1-168 | Time window in hours |
| `minPoints` | 50 | 0-500 | Min points threshold |
| `minComments` | 20 | 0-100 | Min comments threshold |

## Ranking Algorithm

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `commentWeight` | 0.75 | 0-2 | Comment weight in ranking |
| `recencyBonusMax` | 100 | 0-200 | Max recency bonus |

**Formula:** points + (comments × commentWeight) + recency bonus

## Comment Display

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `maxRootComments` | 12 | 1-50 | Root comments per story |
| `maxChildComments` | 8 | 1-20 | Child comments per parent |
| `maxCommentLevel` | 3 | 1-10 | Max nesting depth |

## Cache

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `storiesTtlMinutes` | 5 | 1-60 | Cache TTL in minutes |

## Notes

- Only shows "link" type posts (excludes jobs, polls) - not configurable
- Advanced settings (commentWeight, recencyBonusMax, fetchLimit, storiesTtlMinutes) hidden from UI but configurable via config.json
- When closing settings, app auto-refreshes if filter settings changed
