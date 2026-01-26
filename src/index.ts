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

async function main() {
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

  await app.initialize();

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
