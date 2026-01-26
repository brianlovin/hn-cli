import { version as packageVersion } from "../package.json";

const REGISTRY_URL = "https://registry.npmjs.org/@brianlovin/hn-cli/latest";
const PACKAGE_NAME = "@brianlovin/hn-cli";

// Allow simulating different versions for testing
// Usage: HN_SIMULATE_VERSION=0.1.0 HN_SIMULATE_LATEST=0.3.0 bun run start
const currentVersion =
  process.env.HN_SIMULATE_VERSION ?? packageVersion;
const simulatedLatestVersion = process.env.HN_SIMULATE_LATEST;

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}

/**
 * Compare two semver versions.
 * Returns true if latest is newer than current.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const curr = currentParts[i] ?? 0;
    const lat = latestParts[i] ?? 0;
    if (lat > curr) return true;
    if (lat < curr) return false;
  }
  return false;
}

/**
 * Check if a newer version is available on npm.
 * Returns null if check fails (network error, etc).
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  // If simulated latest version is set, skip the network call
  if (simulatedLatestVersion) {
    return {
      hasUpdate: isNewerVersion(currentVersion, simulatedLatestVersion),
      currentVersion,
      latestVersion: simulatedLatestVersion,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version;

    if (!latestVersion) {
      return null;
    }

    return {
      hasUpdate: isNewerVersion(currentVersion, latestVersion),
      currentVersion,
      latestVersion,
    };
  } catch {
    // Network error, timeout, or other issue - silently fail
    return null;
  }
}

/**
 * Get the install command for updating.
 */
export function getUpdateCommand(): string {
  // Check if running via bun or npm based on process info
  const isBun = process.versions.bun !== undefined;
  if (isBun) {
    return `bun install -g ${PACKAGE_NAME}@latest`;
  }
  return `npm install -g ${PACKAGE_NAME}@latest`;
}

export { currentVersion };
