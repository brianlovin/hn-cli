/**
 * Auth setup mode keyboard handlers
 */
import {
  navigateAuthProvider,
  confirmAuthProvider,
  type AuthSetupState,
} from "../components/AuthSetup";

export interface AuthKeyCallbacks {
  hideAuthSetup: () => void;
  showAuthSetupUI: () => void;
}

export function handleAuthSetupKey(
  key: { name?: string },
  authSetupState: AuthSetupState,
  callbacks: AuthKeyCallbacks
): void {
  if (key.name === "escape") {
    callbacks.hideAuthSetup();
    return;
  }

  if (authSetupState.step === "provider") {
    if (key.name === "j" || key.name === "down") {
      navigateAuthProvider(authSetupState, 1);
      callbacks.showAuthSetupUI();
    } else if (key.name === "k" || key.name === "up") {
      navigateAuthProvider(authSetupState, -1);
      callbacks.showAuthSetupUI();
    } else if (key.name === "return" || key.name === "enter") {
      confirmAuthProvider(authSetupState);
      callbacks.showAuthSetupUI();
    }
  }
}
