import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { HackerNewsPost, HackerNewsComment } from "../types";
import { type Provider, getApiKey, getModel } from "../config";
import { stripHtml } from "../utils";
import { log } from "../logger";
import type { ChatMessage } from "../components/ChatPanel";

export interface ChatServiceState {
  anthropic: Anthropic | null;
  openai: OpenAI | null;
  provider: Provider;
  storyContext: string;
  isStreaming: boolean;
}

export function initChatServiceState(provider: Provider): ChatServiceState {
  return {
    anthropic: null,
    openai: null,
    provider,
    storyContext: "",
    isStreaming: false,
  };
}

export function buildStoryContext(post: HackerNewsPost): string {
  const storyUrl = post.url || `https://news.ycombinator.com/item?id=${post.id}`;

  let context = `# Hacker News Story\n\n`;
  context += `**Title:** ${post.title}\n`;
  context += `**URL:** ${storyUrl}\n`;
  if (post.domain) context += `**Domain:** ${post.domain}\n`;
  if (post.points) context += `**Points:** ${post.points}\n`;
  if (post.user) context += `**Posted by:** ${post.user}\n`;
  context += `**Comments:** ${post.comments_count}\n\n`;

  if (post.content) {
    context += `## Story Content\n\n${stripHtml(post.content)}\n\n`;
  }

  if (post.comments && post.comments.length > 0) {
    context += `## Comments\n\n`;
    context += formatCommentsForContext(post.comments);
  }

  return context;
}

function formatCommentsForContext(
  comments: HackerNewsComment[],
  depth = 0,
): string {
  let result = "";
  const indent = "  ".repeat(depth);

  for (const comment of comments) {
    if (comment.user && comment.content) {
      const content = stripHtml(comment.content);
      result += `${indent}**${comment.user}:**\n`;
      const indentedContent = content
        .split("\n")
        .map((line) => `${indent}${line}`)
        .join("\n");
      result += `${indentedContent}\n\n`;

      if (comment.comments && comment.comments.length > 0) {
        result += formatCommentsForContext(comment.comments, depth + 1);
      }
    }
  }

  return result;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export async function streamAIResponse(
  state: ChatServiceState,
  messages: ChatMessage[],
  userMessage: string,
  post: HackerNewsPost,
  callbacks: StreamCallbacks,
): Promise<void> {
  state.isStreaming = true;

  // Build system context if not already built
  if (!state.storyContext) {
    state.storyContext = buildStoryContext(post);
  }

  const storyUrl = post.url || "";
  const systemPrompt = `You are helping a user understand and discuss a Hacker News story and its comments. Here is the full context:

${state.storyContext}

---

The user is reading this in a terminal app and wants to discuss it with you. Be concise but insightful. If they ask about the article content and it would help to have more context, you can suggest they share more details or you can work with what's in the comments.

${storyUrl ? `The original article URL is: ${storyUrl}` : ""}`;

  try {
    if (state.provider === "anthropic") {
      await streamAnthropicResponse(state, messages, userMessage, systemPrompt, callbacks);
    } else {
      await streamOpenAIResponse(state, messages, userMessage, systemPrompt, callbacks);
    }
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }

  state.isStreaming = false;
}

async function streamAnthropicResponse(
  state: ChatServiceState,
  messages: ChatMessage[],
  userMessage: string,
  systemPrompt: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  // Initialize Anthropic client if needed
  if (!state.anthropic) {
    const apiKey = getApiKey("anthropic");
    state.anthropic = new Anthropic({ apiKey });
  }

  const stream = state.anthropic.messages.stream({
    model: getModel("anthropic") as string,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages
      .slice(0, -1)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }))
      .concat([{ role: "user", content: userMessage }]),
  });

  let fullResponse = "";

  stream.on("text", (text) => {
    fullResponse += text;
    callbacks.onText(fullResponse);
  });

  await stream.finalMessage();
  callbacks.onComplete();
}

async function streamOpenAIResponse(
  state: ChatServiceState,
  messages: ChatMessage[],
  userMessage: string,
  systemPrompt: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  log("[openai-stream] Starting stream...");

  // Initialize OpenAI client if needed
  if (!state.openai) {
    const apiKey = getApiKey("openai");
    log("[openai-stream] Initializing client, API key exists:", !!apiKey);
    state.openai = new OpenAI({ apiKey });
  }

  const model = getModel("openai") as string;
  log("[openai-stream] Model:", model);
  log("[openai-stream] Message count:", messages.length);

  const stream = await state.openai.chat.completions.create({
    model,
    max_completion_tokens: 4096,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ],
  });

  log("[openai-stream] Stream created, reading chunks...");
  let fullResponse = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullResponse += delta;
      callbacks.onText(fullResponse);
    }
  }

  log("[openai-stream] Stream complete, response length:", fullResponse.length);
  callbacks.onComplete();
}

export async function generateSuggestions(
  state: ChatServiceState,
  post: HackerNewsPost,
): Promise<string[]> {
  const commentsPreview =
    post.comments
      ?.slice(0, 3)
      .map(
        (c) =>
          `${c.user}: ${stripHtml(c.content || "").slice(0, 100)}...`,
      )
      .join("\n") || "No comments yet";

  const prompt = `Based on this Hacker News story, generate 3 short questions (max 10 words each) a reader might want to ask. Return ONLY the 3 questions, one per line, no numbering or bullets.

Title: ${post.title}
Domain: ${post.domain || "N/A"}
Comments preview:
${commentsPreview}`;

  try {
    let questions: string[] = [];

    if (state.provider === "anthropic") {
      log("[suggestions] Using Anthropic API");
      if (!state.anthropic) {
        const apiKey = getApiKey("anthropic");
        log("[suggestions] API key exists:", !!apiKey);
        state.anthropic = new Anthropic({ apiKey });
      }

      const model = getModel("anthropic") as string;
      log("[suggestions] Model:", model);

      const response = await state.anthropic.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      log("[suggestions] Anthropic response received");
      const firstBlock = response.content[0];
      const text =
        firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
      questions = text
        .split("\n")
        .filter((q: string) => q.trim())
        .slice(0, 3);
    } else {
      log("[suggestions] Using OpenAI API");
      if (!state.openai) {
        const apiKey = getApiKey("openai");
        log("[suggestions] API key exists:", !!apiKey);
        state.openai = new OpenAI({ apiKey });
      }

      const model = getModel("openai") as string;
      log("[suggestions] Model:", model);

      log("[suggestions] Making OpenAI request...");
      const response = await state.openai.chat.completions.create({
        model,
        max_completion_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      log(
        "[suggestions] OpenAI response received:",
        JSON.stringify(response.choices[0], null, 2),
      );
      const text = response.choices[0]?.message?.content || "";
      questions = text
        .split("\n")
        .filter((q: string) => q.trim())
        .slice(0, 3);
    }

    log("[suggestions] Generated questions:", questions);
    return questions;
  } catch (error) {
    log("[ERROR]", "[suggestions] Error generating suggestions:");
    log("[ERROR]", "[suggestions] Error type:", (error as any)?.constructor?.name);
    log(
      "[ERROR]",
      "[suggestions] Error message:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

export async function generateFollowUpQuestions(
  state: ChatServiceState,
  post: HackerNewsPost,
  messages: ChatMessage[],
): Promise<string[]> {
  // Get last 2-4 messages for context (excluding the initial assistant greeting)
  const recentMessages = messages
    .slice(-4)
    .filter((m) => m.content.length < 500)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `Based on this conversation about a Hacker News story, suggest 3 natural follow-up questions the user might want to ask next. The questions should:
- Build on what was just discussed
- Explore related angles or deeper aspects
- Be concise (max 12 words each)

Story: "${post.title}"
Recent conversation:
${recentMessages}

Return ONLY the 3 questions, one per line, no numbering or bullets.`;

  try {
    if (state.provider === "anthropic") {
      if (!state.anthropic) {
        const apiKey = getApiKey("anthropic");
        state.anthropic = new Anthropic({ apiKey });
      }

      const response = await state.anthropic.messages.create({
        model: getModel("anthropic") as string,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      });

      const firstBlock = response.content[0];
      const text =
        firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
      return text
        .split("\n")
        .filter((q: string) => q.trim())
        .slice(0, 3);
    } else {
      if (!state.openai) {
        const apiKey = getApiKey("openai");
        state.openai = new OpenAI({ apiKey });
      }

      const response = await state.openai.chat.completions.create({
        model: getModel("openai") as string,
        max_completion_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.choices[0]?.message?.content || "";
      return text
        .split("\n")
        .filter((q: string) => q.trim())
        .slice(0, 3);
    }
  } catch (error) {
    log("[ERROR]", "[follow-up] Error:", error);
    return [];
  }
}

export function resetChatServiceClients(state: ChatServiceState): void {
  state.anthropic = null;
  state.openai = null;
}

export function setProvider(state: ChatServiceState, provider: Provider): void {
  state.provider = provider;
}
