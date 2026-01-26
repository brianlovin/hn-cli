#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { exec } from "child_process";
import { HackerNewsApp } from "./app";
import { checkForUpdates, currentVersion } from "./version";
import { setTelemetryEnabled } from "./config";
import * as telemetry from "./telemetry";

const COLORS = {
  bg: "#1a1a1a",
};

function parseArgs(): { storyId?: number } {
  const args = process.argv.slice(2);
  let storyId: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle --story=123 or -s=123
    if (arg?.startsWith("--story=") || arg?.startsWith("-s=")) {
      const value = arg.split("=")[1];
      if (value) {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed > 0) storyId = parsed;
      }
    }
    // Handle --story 123 or -s 123
    else if (arg === "--story" || arg === "-s") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        const parsed = parseInt(nextArg, 10);
        if (!isNaN(parsed) && parsed > 0) storyId = parsed;
        i++; // Skip next arg
      }
    }
  }

  return { storyId };
}

async function main() {
  const { storyId } = parseArgs();

  // Handle --disable-telemetry flag (permanently disables telemetry)
  if (process.argv.includes("--disable-telemetry")) {
    setTelemetryEnabled(false);
  }

  // Initialize telemetry and track app launch
  telemetry.init();
  telemetry.track("app_launch", { version: currentVersion });

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: COLORS.bg,
    // Enable mouse movement tracking for text selection
    enableMouseMovement: true,
    // Enable kitty keyboard protocol for proper option/alt key detection
    useKittyKeyboard: {
      disambiguate: true,
      alternateKeys: true,
    },
  });

  const app = new HackerNewsApp(renderer, {
    onOpenUrl: (url) => {
      exec(`open "${url}"`);
    },
    onExit: async () => {
      await telemetry.flushSync();
      renderer.destroy();
      process.exit(0);
    },
  });

  await app.initialize({ requestedStoryId: storyId });

  // Check for updates in the background (non-blocking)
  app.startHeaderLoading();
  checkForUpdates().then((updateInfo) => {
    app.stopHeaderLoading();
    if (updateInfo?.hasUpdate) {
      app.setUpdateInfo(updateInfo);
    }
  });

  renderer.start();
}

main().catch(console.error);
