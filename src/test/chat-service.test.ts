import { describe, it, expect, mock } from "bun:test";

class FakeResponseStream {
  private handlers = new Map<string, Array<(event: any) => void>>();
  private resolveFinal: (() => void) | null = null;
  aborted = false;

  on(event: string, handler: (event: any) => void) {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
    return this;
  }

  emit(event: string, payload: any) {
    const handlers = this.handlers.get(event) ?? [];
    for (const handler of handlers) {
      handler(payload);
    }
  }

  abort() {
    this.aborted = true;
    if (this.resolveFinal) {
      this.resolveFinal();
      this.resolveFinal = null;
    }
  }

  finalResponse() {
    return new Promise((resolve) => {
      if (this.aborted) {
        resolve({});
        return;
      }
      this.resolveFinal = () => resolve({});
    });
  }
}

let lastStream: FakeResponseStream | null = null;

mock.module("openai", () => ({
  default: class OpenAI {
    responses = {
      stream: () => {
        lastStream = new FakeResponseStream();
        return lastStream;
      },
    };

    chat = {
      completions: {
        create: async () => {
          throw new Error("Unexpected chat.completions.create call");
        },
      },
    };
  },
}));

import {
  initChatServiceState,
  streamAIResponse,
  cancelChatStream,
} from "../services/ChatService";
import type { HackerNewsPost } from "../types";

const createPost = (): HackerNewsPost => ({
  id: 1,
  title: "Test story",
  points: 0,
  user: "tester",
  time: Date.now(),
  time_ago: "just now",
  type: "story",
  content: null,
  url: "https://example.com",
  domain: "example.com",
  comments: [],
  comments_count: 0,
});

describe("ChatService cancellation", () => {
  it("cancels an active stream and suppresses callbacks", async () => {
    const state = initChatServiceState("openai");
    const post = createPost();
    const onText = mock(() => {});
    const onComplete = mock(() => {});
    const onError = mock(() => {});

    const streamPromise = streamAIResponse(state, [], "hello", post, {
      onText,
      onComplete,
      onError,
    });

    expect(lastStream).not.toBeNull();
    cancelChatStream(state);

    lastStream?.emit("response.output_text.delta", { snapshot: "hi" });
    await streamPromise;

    expect(lastStream?.aborted).toBe(true);
    expect(state.isStreaming).toBe(false);
    expect(state.activeStream).toBeNull();
    expect(onText).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
