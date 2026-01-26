/**
 * Settings mode keyboard handlers
 */
import type { Provider } from "../config";
import {
  navigateSettings,
  selectSettingsItem,
  adjustSettingValue,
  goBackInSettings,
  getSelectedProviderUrl,
  type SettingsState,
  type SettingsAction,
} from "../components/SettingsPanel";
import { resetSettings } from "../settings";

export interface SettingsKeyCallbacks {
  hideSettings: () => void;
  rerenderSettings: () => void;
  handleSettingsAction: (action: NonNullable<SettingsAction>) => void;
  openUrl: (url: string) => void;
}

export function handleSettingsKey(
  key: { name?: string },
  settingsState: SettingsState,
  currentProvider: Provider,
  callbacks: SettingsKeyCallbacks
): void {
  if (key.name === "escape") {
    if (!goBackInSettings(settingsState)) {
      callbacks.hideSettings();
    } else {
      callbacks.rerenderSettings();
    }
    return;
  }

  if (key.name === "j" || key.name === "down") {
    navigateSettings(settingsState, 1, currentProvider);
    callbacks.rerenderSettings();
  } else if (key.name === "k" || key.name === "up") {
    navigateSettings(settingsState, -1, currentProvider);
    callbacks.rerenderSettings();
  } else if (key.name === "tab") {
    // Open API key URL if a provider without a key is selected
    const url = getSelectedProviderUrl(settingsState, currentProvider);
    if (url) {
      callbacks.openUrl(url);
    }
  } else if (key.name === "left" || key.name === "h") {
    // Decrease setting value
    const action = adjustSettingValue(settingsState, currentProvider, -1);
    if (action) {
      callbacks.handleSettingsAction(action);
    }
  } else if (key.name === "right" || key.name === "l") {
    // Increase setting value
    const action = adjustSettingValue(settingsState, currentProvider, 1);
    if (action) {
      callbacks.handleSettingsAction(action);
    }
  } else if (key.name === "return" || key.name === "enter") {
    const action = selectSettingsItem(settingsState, currentProvider);
    if (action) {
      callbacks.handleSettingsAction(action);
    }
  } else if (key.name === "r") {
    // Reset all filter settings to defaults
    resetSettings();
    callbacks.rerenderSettings();
  }
}
