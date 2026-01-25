/**
 * Debug script to capture TUI output for evaluation
 * Run with: bun run debug
 *
 * This creates a test renderer and captures frames for visual inspection.
 */

import { createTestRenderer } from "@opentui/core/testing";
import { HackerNewsApp } from "./app";
import { createMockPostWithComments, createMockPosts } from "./test/fixtures";
import { writeFileSync } from "fs";

interface DebugScenario {
  name: string;
  setup: (app: HackerNewsApp) => Promise<void>;
  afterRender?: (app: HackerNewsApp) => void;
}

const scenarios: DebugScenario[] = [
  {
    name: "story-list",
    setup: async (app) => {
      const posts = createMockPosts(15);
      app.setPostsForTesting(posts);
    },
  },
  {
    name: "long-comments",
    setup: async (app) => {
      const post = createMockPostWithComments(
        {
          id: 12345,
          title: "Test Post with Long Comments to Debug Text Wrapping Issues",
          domain: "example.com",
          points: 150,
          user: "testuser",
          time_ago: "2 hours ago",
        },
        1
      );

      // Override with long nested comments
      post.comments = [
        {
          id: 1,
          user: "princevegeta89",
          level: 0,
          content: `<p>No surprises. No matter how we look at it, EVs are much friendlier and safer to the environment. Some people argue the source of electricity can be contested against because that involves fossil fuel burning again, but in today's world we are rapidly moving away from it and towards nuclear/hydel/wind methods for generating power.</p><p>I hope ICE cars completely become a thing of the past in the next couple of decades to come.</p>`,
          comments: [
            {
              id: 2,
              user: "MBCook",
              level: 1,
              content: `<p>The number of ICE cars I get stuck behind from time to time that just REEK is amazing. I'm in decently well off area too. Some putting off soot clouds, white smoke, nothing visible but clearly not doing complete combustion. Sometimes I wonder if half the cylinders are even working.</p>`,
              comments: [
                {
                  id: 3,
                  user: "srmarm",
                  level: 2,
                  content: `<p>My city is covered by a low emissions zone so the odd van polluting sticks out. I was in Athens recently and the pollution from so many old rough cars was so noticeable (and quite unpleasant).</p>`,
                  comments: [
                    {
                      id: 4,
                      user: "deepnester",
                      level: 3,
                      content: `<p>This is a level 3 nested comment that should still wrap properly even with significant indentation from the parent comments.</p>`,
                      comments: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 5,
          user: "another_user",
          level: 0,
          content: `<p>This is another root level comment that should also wrap properly within the available space of the detail panel.</p>`,
          comments: [],
        },
      ];
      post.comments_count = 5;

      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);
    },
    afterRender: (app) => {
      const boxes = (app as any).rootCommentBoxes;
      const scroll = (app as any).detailScroll;
      const scrollContent = scroll.content;

      console.log("\n=== LONG COMMENTS NAV DEBUG ===");
      console.log(`Root comment boxes: ${boxes.length}`);
      console.log(`Scroll height: ${scroll.scrollHeight}`);
      console.log(`Scroll viewport height: ${scroll.height}`);
      console.log(`Max scrollTop: ${scroll.scrollHeight - scroll.height}`);
      console.log(`Scroll content y: ${scrollContent.y}`);

      boxes.forEach((box: any, i: number) => {
        const relY = box.y - scrollContent.y;
        console.log(`  [${i}] y=${box.y}, relY=${relY}, height=${box.height}`);
      });

      // Test navigation
      console.log("\n=== Navigation test ===");
      const maxScroll = scroll.scrollHeight - scroll.height;
      for (let i = 0; i < boxes.length; i++) {
        const relY = boxes[i].y - scrollContent.y;
        const targetScroll = Math.max(0, relY - 1);
        const actualScroll = Math.min(targetScroll, maxScroll);
        console.log(`Comment ${i}: target scrollTop=${targetScroll}, actual=${actualScroll}`);
      }

      console.log("\n=== END DEBUG ===\n");
    },
  },
  {
    name: "highlighted-comment",
    setup: async (app) => {
      const post = createMockPostWithComments({}, 5);
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);
      // Navigate to 3rd comment to show highlighting
      (app as any).rootCommentIndex = 2;
      (app as any).renderDetail(post);
    },
  },
  {
    name: "nav-debug",
    setup: async (app) => {
      const post = createMockPostWithComments(
        {
          id: 12345,
          title: "Navigation Debug Test",
          domain: "example.com",
        },
        12 // 12 root comments to ensure scrolling is needed
      );
      app.setPostsForTesting([post]);
      await app.setSelectedPostForTesting(post);
    },
    afterRender: (app) => {
      const boxes = (app as any).rootCommentBoxes;
      const scroll = (app as any).detailScroll;
      const scrollContent = scroll.content;

      console.log("\n=== NAVIGATION DEBUG ===");
      console.log(`Root comments: ${boxes.length}`);
      console.log(`Scroll: height=${scroll.scrollHeight}, viewport=${scroll.height}, maxScroll=${scroll.scrollHeight - scroll.height}`);

      // Test navigation
      (app as any).rootCommentIndex = 0;
      for (let i = 0; i < 4; i++) {
        (app as any).navigateToNextComment();
      }
      console.log(`Navigated to comment 4: scrollTop=${scroll.scrollTop}`);

      console.log("=== END DEBUG ===\n");
    },
  },
];

async function runDebug() {
  const scenarioName = process.argv[2] || "long-comments";
  const scenario = scenarios.find((s) => s.name === scenarioName);

  if (!scenario) {
    console.log("Available scenarios:");
    scenarios.forEach((s) => console.log(`  - ${s.name}`));
    console.log(`\nUsage: bun run debug [scenario-name]`);
    process.exit(1);
  }

  console.log(`Running scenario: ${scenario.name}\n`);

  const testContext = await createTestRenderer({
    width: 120,
    height: 50,
    kittyKeyboard: true,
  });

  const { renderer, renderOnce, captureCharFrame } = testContext;

  const app = new HackerNewsApp(renderer, {
    onOpenUrl: (url) => console.log("Would open:", url),
    onExit: () => {},
  });

  app.initializeForTesting();
  await scenario.setup(app);
  await renderOnce();

  // Run afterRender hook if defined
  scenario.afterRender?.(app);

  const frame = captureCharFrame();

  // Save to file
  const outputPath = `/Users/brian/Developer/hn-cli/debug-output-${scenario.name}.txt`;
  writeFileSync(outputPath, frame);

  console.log(`Frame dimensions: ${frame.split("\n")[0]?.length || 0}x${frame.split("\n").length}`);
  console.log(`Saved to: ${outputPath}\n`);
  console.log("--- CAPTURED FRAME ---\n");
  console.log(frame);
  console.log("\n--- END FRAME ---");

  renderer.destroy();
  process.exit(0);
}

runDebug().catch(console.error);
