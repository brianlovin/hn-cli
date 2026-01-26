import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { HackerNewsPost, HackerNewsComment } from "../types";
import { type Provider, getApiKey, getModel, CHEAP_ANTHROPIC_MODEL, CHEAP_OPENAI_MODEL } from "../config";
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

  let context = `# Story Being Discussed\n\n`;
  context += `**Title:** ${post.title}\n`;
  context += `**URL:** ${storyUrl}\n`;
  if (post.domain) context += `**Domain:** ${post.domain}\n`;
  if (post.points) context += `**Points:** ${post.points}\n`;
  if (post.user) context += `**Posted by:** ${post.user}\n`;
  context += `**Comments:** ${post.comments_count}\n\n`;

  if (post.content) {
    context += `## Story Text\n\n${stripHtml(post.content)}\n\n`;
  }

  if (post.comments && post.comments.length > 0) {
    context += `# Hacker News Discussion\n\n`;
    context += `The following are comments from the Hacker News community discussing this story:\n\n`;
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

  const systemPrompt = `You are helping a user understand and discuss a Hacker News story.

${state.storyContext}

---

IMPORTANT CONTEXT DISTINCTION:
- The "Story Being Discussed" section above contains metadata about the linked article/content
- The "Hacker News Discussion" section contains community comments ABOUT that story
- If the user asks about the original article/video content, use web search to fetch and read the URL: ${storyUrl}

The user is reading this in a terminal app. Be concise but insightful. When you search the web for article content, clearly distinguish between what's in the article versus what's being discussed in the HN comments.`;

  try {
    if (state.provider === "anthropic") {
      await streamAnthropicResponse(state, messages, userMessage, systemPrompt, storyUrl, callbacks);
    } else {
      await streamOpenAIResponse(state, messages, userMessage, systemPrompt, storyUrl, callbacks);
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
  storyUrl: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  // Initialize Anthropic client if needed
  if (!state.anthropic) {
    const apiKey = getApiKey("anthropic");
    state.anthropic = new Anthropic({ apiKey });
  }

  // Build the tools array with web search if we have a story URL
  // Cast through unknown since the web search tool type isn't fully typed in the SDK yet
  const tools: Anthropic.Messages.Tool[] = storyUrl
    ? [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        } as unknown as Anthropic.Messages.Tool,
      ]
    : [];

  const stream = state.anthropic.messages.stream({
    model: getModel("anthropic") as string,
    max_tokens: 4096,
    system: systemPrompt,
    tools: tools.length > 0 ? tools : undefined,
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
  storyUrl: string,
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

  // Use Responses API with streaming and web search for OpenAI
  if (storyUrl) {
    try {
      log("[openai-stream] Using Responses API stream with web_search tool");
      const stream = state.openai.responses.stream({
        model,
        tools: [{ type: "web_search" }],
        input: [
          { role: "developer", content: systemPrompt },
          ...messages.slice(0, -1).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: userMessage },
        ],
      });

      // Listen for text delta events (snapshot contains accumulated text)
      stream.on("response.output_text.delta", (event) => {
        callbacks.onText(event.snapshot);
      });

      // Wait for stream to complete
      await stream.finalResponse();
      log("[openai-stream] Responses API stream complete");
      callbacks.onComplete();
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("[openai-stream] Responses API failed, falling back to chat completions without web search. Error:", errorMessage);
      // Fall through to chat completions (web search will not be available)
    }
  }

  // Fallback to Chat Completions (no web search capability)
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

    // Use cheap models for suggestion generation to save cost
    if (state.provider === "anthropic") {
      log("[suggestions] Using Anthropic API with cheap model");
      if (!state.anthropic) {
        const apiKey = getApiKey("anthropic");
        log("[suggestions] API key exists:", !!apiKey);
        state.anthropic = new Anthropic({ apiKey });
      }

      log("[suggestions] Model:", CHEAP_ANTHROPIC_MODEL);

      const response = await state.anthropic.messages.create({
        model: CHEAP_ANTHROPIC_MODEL,
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
      log("[suggestions] Using OpenAI API with cheap model");
      if (!state.openai) {
        const apiKey = getApiKey("openai");
        log("[suggestions] API key exists:", !!apiKey);
        state.openai = new OpenAI({ apiKey });
      }

      log("[suggestions] Model:", CHEAP_OPENAI_MODEL);

      log("[suggestions] Making OpenAI request...");
      const response = await state.openai.chat.completions.create({
        model: CHEAP_OPENAI_MODEL,
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
    // Use cheap models for follow-up generation to save cost
    if (state.provider === "anthropic") {
      if (!state.anthropic) {
        const apiKey = getApiKey("anthropic");
        state.anthropic = new Anthropic({ apiKey });
      }

      const response = await state.anthropic.messages.create({
        model: CHEAP_ANTHROPIC_MODEL,
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
        model: CHEAP_OPENAI_MODEL,
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
