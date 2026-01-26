import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import * as telemetry from "../telemetry";
import * as config from "../config";
import pkg from "../../package.json";

describe("telemetry", () => {
  beforeEach(() => {
    telemetry.reset();
    // Force enable telemetry for tests (bypass development mode check)
    telemetry.setForceEnabled(true);
  });

  afterEach(() => {
    telemetry.reset();
  });

  test("track queues events when initialized and enabled", () => {
    // Mock config to return enabled
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);

    telemetry.init();
    telemetry.track("app_launch", { version: "1.0.0" });
    telemetry.track("story_selected");

    expect(telemetry.getQueueLength()).toBe(2);

    isTelemetryEnabledMock.mockRestore();
  });

  test("track does not queue events when not initialized", () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);

    // Don't call init()
    telemetry.track("app_launch", { version: "1.0.0" });

    expect(telemetry.getQueueLength()).toBe(0);

    isTelemetryEnabledMock.mockRestore();
  });

  test("track does not queue events when telemetry is disabled", () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(false);

    telemetry.init();
    telemetry.track("app_launch", { version: "1.0.0" });

    expect(telemetry.getQueueLength()).toBe(0);

    isTelemetryEnabledMock.mockRestore();
  });

  test("clearQueue resets the queue", () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);

    telemetry.init();
    telemetry.track("app_launch");
    telemetry.track("story_selected");
    expect(telemetry.getQueueLength()).toBe(2);

    telemetry.clearQueue();
    expect(telemetry.getQueueLength()).toBe(0);

    isTelemetryEnabledMock.mockRestore();
  });

  test("reset clears queue and uninitializes", () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);

    telemetry.init();
    telemetry.track("app_launch");
    expect(telemetry.getQueueLength()).toBe(1);

    telemetry.reset();
    expect(telemetry.getQueueLength()).toBe(0);

    // After reset, tracking should not work until init is called again
    telemetry.track("story_selected");
    expect(telemetry.getQueueLength()).toBe(0);

    isTelemetryEnabledMock.mockRestore();
  });

  test("flush does nothing when queue is empty", async () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);

    telemetry.init();
    // Should not throw
    await telemetry.flush();

    isTelemetryEnabledMock.mockRestore();
  });

  test("flush does nothing when telemetry is disabled", async () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(false);

    telemetry.init();
    // Should not throw and should not make any network request
    await telemetry.flush();

    isTelemetryEnabledMock.mockRestore();
  });

  test("auto-flush triggers when FLUSH_THRESHOLD is reached", async () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);
    const getUserIdMock = spyOn(config, "getUserId").mockReturnValue("test-user-id");

    // Mock fetch to track calls
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    mockFetch.preconnect = originalFetch.preconnect;
    globalThis.fetch = mockFetch as typeof fetch;

    telemetry.init();

    // Track 9 events - should not trigger flush yet
    for (let i = 0; i < 9; i++) {
      telemetry.track("story_selected");
    }
    expect(telemetry.getQueueLength()).toBe(9);
    expect(fetchCalled).toBe(false);

    // Track 10th event - should trigger auto-flush
    telemetry.track("story_selected");

    // Wait for the async flush to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fetchCalled).toBe(true);
    // Queue should be empty after successful flush
    expect(telemetry.getQueueLength()).toBe(0);

    // Restore mocks
    globalThis.fetch = originalFetch;
    isTelemetryEnabledMock.mockRestore();
    getUserIdMock.mockRestore();
  });

  test("concurrent flush calls are prevented", async () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);
    const getUserIdMock = spyOn(config, "getUserId").mockReturnValue("test-user-id");

    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    const mockFetch = async () => {
      fetchCallCount++;
      // Simulate slow network
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    mockFetch.preconnect = originalFetch.preconnect;
    globalThis.fetch = mockFetch as typeof fetch;

    telemetry.init();
    telemetry.track("app_launch");
    telemetry.track("story_selected");

    // Start two flushes concurrently
    const flush1 = telemetry.flush();
    const flush2 = telemetry.flush();

    await Promise.all([flush1, flush2]);

    // Only one fetch should have been made due to the isFlushing guard
    expect(fetchCallCount).toBe(1);

    // Restore mocks
    globalThis.fetch = originalFetch;
    isTelemetryEnabledMock.mockRestore();
    getUserIdMock.mockRestore();
  });

  test("flush sends version in request body", async () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);
    const getUserIdMock = spyOn(config, "getUserId").mockReturnValue("test-user-id");

    let capturedBody: { userId: string; version: string; events: unknown[] } | null = null;
    const originalFetch = globalThis.fetch;
    const mockFetch = async (_url: string, options: RequestInit) => {
      capturedBody = JSON.parse(options.body as string);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    mockFetch.preconnect = originalFetch.preconnect;
    globalThis.fetch = mockFetch as typeof fetch;

    telemetry.init();
    telemetry.track("app_launch");
    await telemetry.flush();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.version).toBe(pkg.version);
    expect(capturedBody!.userId).toBe("test-user-id");
    expect(capturedBody!.events).toHaveLength(1);

    // Restore mocks
    globalThis.fetch = originalFetch;
    isTelemetryEnabledMock.mockRestore();
    getUserIdMock.mockRestore();
  });

  test("consecutive failures stop retrying after MAX_CONSECUTIVE_FAILURES", async () => {
    const isTelemetryEnabledMock = spyOn(config, "isTelemetryEnabled").mockReturnValue(true);
    const getUserIdMock = spyOn(config, "getUserId").mockReturnValue("test-user-id");

    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    const mockFetch = async (): Promise<Response> => {
      fetchCallCount++;
      throw new Error("Network error");
    };
    mockFetch.preconnect = originalFetch.preconnect;
    globalThis.fetch = mockFetch as typeof fetch;

    telemetry.init();

    // First failure
    telemetry.track("app_launch");
    await telemetry.flush();
    expect(fetchCallCount).toBe(1);

    // Second failure
    await telemetry.flush();
    expect(fetchCallCount).toBe(2);

    // Third failure
    await telemetry.flush();
    expect(fetchCallCount).toBe(3);

    // Fourth attempt - should be skipped due to MAX_CONSECUTIVE_FAILURES
    await telemetry.flush();
    expect(fetchCallCount).toBe(3); // Still 3, no new call

    // Restore mocks
    globalThis.fetch = originalFetch;
    isTelemetryEnabledMock.mockRestore();
    getUserIdMock.mockRestore();
  });
});
