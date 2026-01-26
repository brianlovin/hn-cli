#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { exec } from "child_process";
import { HackerNewsApp } from "./app";
import { checkForUpdates } from "./version";

const COLORS = {
  bg: "#1a1a1a",
};

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: COLORS.bg,
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
    onExit: () => {
      renderer.destroy();
      process.exit(0);
    },
  });

  // Check for updates in the background (non-blocking)
  checkForUpdates().then((updateInfo) => {
    if (updateInfo?.hasUpdate) {
      app.setUpdateInfo(updateInfo);
    }
  });

  await app.initialize();
  renderer.start();
}

main().catch(console.error);
