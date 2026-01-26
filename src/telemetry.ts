import { isTelemetryEnabled, getUserId } from "./config";

/**
 * Detect if we're running in development mode.
 * Development mode is when running from source (src/) rather than
 * the built/installed version (dist/).
 * Can be overridden with --telemetry-test flag for testing.
 */
function isDevelopment(): boolean {
  // Allow forcing enabled for tests
  if (forceEnabled) {
    return false;
  }

  // Allow testing telemetry in dev with --telemetry-test flag
  if (process.argv.includes("--telemetry-test")) {
    return false;
  }

  // Check if we're running with --watch (bun run dev)
  if (process.argv.includes("--watch")) {
    return true;
  }

  // Check if we're running from src/ directory (development)
  // vs dist/ directory (production/installed)
  const mainScript = process.argv[1] || "";
  if (mainScript.includes("/src/") || mainScript.endsWith("/src/index.ts")) {
    return true;
  }

  return false;
}

// Telemetry event types
export type TelemetryEvent =
  | "app_launch"
  | "story_selected"
  | "comment_nav"
  | "tldr_requested"
  | "tldr_completed"
  | "chat_opened"
  | "chat_message"
  | "url_opened"
  | "refresh"
  | "settings_opened";

interface QueuedEvent {
  event: TelemetryEvent;
  timestamp: number;
  properties?: Record<string, unknown>;
}

// Configuration
const TELEMETRY_ENDPOINT = "https://brianlovin.com/api/hn-cli/telemetry";
const FLUSH_THRESHOLD = 10; // Flush after this many events
const FLUSH_TIMEOUT_MS = 5000; // Timeout for flush requests
const EXIT_FLUSH_TIMEOUT_MS = 1500; // Shorter timeout for exit flush
const MAX_CONSECUTIVE_FAILURES = 3; // Stop retrying after this many failures

// Event queue
let eventQueue: QueuedEvent[] = [];
let isInitialized = false;
let forceEnabled = false; // For testing only
let isFlushing = false; // Prevent concurrent flushes
let consecutiveFailures = 0; // Track consecutive flush failures

/**
 * Initialize telemetry. Call once at app startup.
 */
export function init(): void {
  isInitialized = true;
}

/**
 * Track a telemetry event. Events are queued and sent in batches.
 * This function never throws - telemetry failures are silent.
 * Telemetry is disabled in development mode (running from source).
 */
export function track(event: TelemetryEvent, properties?: Record<string, unknown>): void {
  if (!isInitialized || !isTelemetryEnabled() || isDevelopment()) {
    return;
  }

  eventQueue.push({
    event,
    timestamp: Date.now(),
    properties,
  });

  // Auto-flush if we've accumulated enough events
  if (eventQueue.length >= FLUSH_THRESHOLD) {
    flush().catch(() => {
      // Silent failure - telemetry should never impact the app
    });
  }
}

/**
 * Flush all queued events to the server.
 * Call this before app exit to ensure all events are sent.
 * Telemetry is disabled in development mode (running from source).
 */
export async function flush(): Promise<void> {
  await flushWithTimeout(FLUSH_TIMEOUT_MS);
}

/**
 * Flush with a shorter timeout, suitable for app exit.
 * This prevents delaying shutdown when the server is slow.
 */
export async function flushSync(): Promise<void> {
  await flushWithTimeout(EXIT_FLUSH_TIMEOUT_MS);
}

async function flushWithTimeout(timeoutMs: number): Promise<void> {
  if (!isInitialized || !isTelemetryEnabled() || isDevelopment() || eventQueue.length === 0) {
    return;
  }

  // Prevent concurrent flushes
  if (isFlushing) {
    return;
  }

  // Skip if we've had too many consecutive failures
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return;
  }

  isFlushing = true;

  // Take the current queue and clear it
  const eventsToSend = [...eventQueue];
  eventQueue = [];

  try {
    const userId = getUserId();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        events: eventsToSend,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      consecutiveFailures++;
      // Put events back in queue for retry (but don't accumulate forever)
      if (eventQueue.length < FLUSH_THRESHOLD * 2 && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        eventQueue = [...eventsToSend, ...eventQueue];
      }
    } else {
      // Success - reset failure counter
      consecutiveFailures = 0;
    }
  } catch {
    consecutiveFailures++;
    // Silent failure - put events back for potential retry
    if (eventQueue.length < FLUSH_THRESHOLD * 2 && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      eventQueue = [...eventsToSend, ...eventQueue];
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * Get the number of queued events (for testing)
 */
export function getQueueLength(): number {
  return eventQueue.length;
}

/**
 * Clear the event queue (for testing)
 */
export function clearQueue(): void {
  eventQueue = [];
}

/**
 * Reset telemetry state (for testing)
 */
export function reset(): void {
  eventQueue = [];
  isInitialized = false;
  forceEnabled = false;
  isFlushing = false;
  consecutiveFailures = 0;
}

/**
 * Force telemetry to be enabled even in development mode (for testing)
 */
export function setForceEnabled(enabled: boolean): void {
  forceEnabled = enabled;
}
