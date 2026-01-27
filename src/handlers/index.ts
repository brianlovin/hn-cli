/**
 * Keyboard handlers for different application modes
 *
 * These handlers are extracted from app.ts to improve organization and testability.
 * Each handler receives the necessary state and callbacks to perform its actions.
 * See src/test/handlers.test.ts for unit tests.
 */

export { handleMainKey, type MainKeyCallbacks } from "./main-keys";
export { handleChatKey, type ChatKeyCallbacks } from "./chat-keys";
export { handleSettingsKey, type SettingsKeyCallbacks } from "./settings-keys";
export { handleAuthSetupKey, type AuthKeyCallbacks } from "./auth-keys";
