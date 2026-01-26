import { createTestRenderer, type TestRenderer, type MockInput, type MockMouse } from "@opentui/core/testing";
import { HackerNewsApp } from "../app";

export interface TestContext {
  renderer: TestRenderer;
  mockInput: MockInput;
  mockMouse: MockMouse;
  app: HackerNewsApp;
  renderOnce: () => Promise<void>;
  captureCharFrame: () => string;
}

export interface TestContextOptions {
  width?: number;
  height?: number;
  kittyKeyboard?: boolean;
  otherModifiersMode?: boolean;
}

const DEFAULT_OPTIONS: TestContextOptions = {
  width: 120,
  height: 40,
  kittyKeyboard: true,
  otherModifiersMode: true,
};

/**
 * Creates a test context with a HackerNewsApp instance.
 * Use this in beforeEach to set up tests.
 */
export async function createAppTestContext(
  options: TestContextOptions = {}
): Promise<TestContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const testContext = await createTestRenderer({
    width: opts.width!,
    height: opts.height!,
    kittyKeyboard: opts.kittyKeyboard,
    otherModifiersMode: opts.otherModifiersMode,
  });

  const app = new HackerNewsApp(testContext.renderer, {
    onOpenUrl: () => {},
    onExit: () => {},
  });

  app.initializeForTesting();

  return {
    renderer: testContext.renderer,
    mockInput: testContext.mockInput,
    mockMouse: testContext.mockMouse,
    app,
    renderOnce: testContext.renderOnce,
    captureCharFrame: testContext.captureCharFrame,
  };
}

/**
 * Cleans up the test context.
 * Use this in afterEach to clean up tests.
 */
export async function cleanupTestContext(ctx: TestContext): Promise<void> {
  ctx.app.cleanup();
  await ctx.renderer.idle();
  ctx.renderer.destroy();
}
