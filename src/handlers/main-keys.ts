/**
 * Main view keyboard handlers (when not in chat, settings, or auth mode)
 */
import type { KeyEvent } from "../types";
import * as telemetry from "../telemetry";

export interface MainKeyCallbacks {
  navigateStory: (delta: number) => void;
  navigateToNextComment: () => void;
  scrollComments: (lines: number) => void;
  openStoryUrl: () => void;
  openChat: () => void;
  refresh: () => void;
  handleTldrRequest: () => void;
  showSettings: () => void;
}

export function handleMainKey(
  key: KeyEvent,
  callbacks: MainKeyCallbacks
): void {
  if (key.name === "s") {
    telemetry.track("settings_opened");
    callbacks.showSettings();
    return;
  }

  if (key.name === "j") {
    callbacks.navigateStory(1);
  } else if (key.name === "k") {
    callbacks.navigateStory(-1);
  } else if (key.name === "down") {
    callbacks.scrollComments(3);
  } else if (key.name === "up") {
    callbacks.scrollComments(-3);
  } else if (key.name === "space" || key.name === " ") {
    telemetry.track("comment_nav");
    callbacks.navigateToNextComment();
  } else if (key.name === "o") {
    telemetry.track("url_opened", { type: "url" });
    callbacks.openStoryUrl();
  } else if (key.name === "c") {
    telemetry.track("chat_opened");
    callbacks.openChat();
  } else if (key.name === "r") {
    telemetry.track("refresh");
    callbacks.refresh();
  } else if (key.name === "t") {
    telemetry.track("tldr_requested");
    callbacks.handleTldrRequest();
  }
}
