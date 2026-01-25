import { createCliRenderer } from "@opentui/core";
import { exec } from "child_process";
import { HackerNewsApp } from "./app";

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

  await app.initialize();
  renderer.start();
}

main().catch(console.error);
