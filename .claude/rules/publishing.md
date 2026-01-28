# Publishing

Published as `@brianlovin/hn-cli` on npm.

## Release Process

```bash
npm version patch   # or minor/major
git push origin main --tags
gh release create v0.x.x --generate-notes
```

The GitHub Action automatically builds, tests, and publishes to npm when a release is created.

## Update Notifications

The app checks for updates and shows a banner when a new version is available.

### Testing Update UI

```bash
bun run dev:update  # Simulates v0.1.0 with v0.3.0 available
```

Custom versions:
```bash
HN_SIMULATE_VERSION=0.2.0 HN_SIMULATE_LATEST=0.5.0 bun run start
```

## Telemetry

Anonymous usage telemetry is enabled by default. Users can disable via:
- Settings menu (`s`) → toggle Telemetry off
- `hn --disable-telemetry` flag (permanently disables)
