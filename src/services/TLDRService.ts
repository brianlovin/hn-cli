import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { HackerNewsPost } from "../types";
import { type Provider, getApiKey, CHEAP_ANTHROPIC_MODEL, CHEAP_OPENAI_MODEL } from "../config";
import { buildStoryContext } from "./ChatService";
import { log } from "../logger";

const TLDR_SYSTEM_PROMPT = `You are summarizing a Hacker News story for a terminal app. Be extremely concise.

IMPORTANT: Output ONLY the summary. Do not include any thinking, planning, or meta-commentary like "I need to search for...", "Let me...", "I'll...", etc.

Format your response exactly like this (use the exact separator):
[2-3 sentences summarizing the article. Key points only.]
---DISCUSSION---
[2-3 sentences summarizing the HN discussion. Main themes and notable opinions only.]

Rules:
- No headers, labels, or markdown formatting
- No preamble, intro text, or thinking out loud
- Keep each section to 2-3 sentences maximum
- Be direct and dense with information
- Use exactly "---DISCUSSION---" as the separator between sections
- Start immediately with the article summary content`;

export interface TLDRResult {
  articleSummary: string;
  discussionSummary: string;
}

export interface TLDRCallbacks {
  onComplete: (result: TLDRResult) => void;
  onError: (error: Error) => void;
}

// Patterns that indicate AI thinking/planning rather than actual content
const THINKING_PATTERNS = [
  /^I need to .+?\./i,
  /^I('ll| will) .+?\./i,
  /^Let me .+?\./i,
  /^First,? I .+?\./i,
  /^To .+?, I .+?\./i,
  /^I should .+?\./i,
  /^I'm going to .+?\./i,
  /^Now I .+?\./i,
  /^Based on .+?, I .+?\./i,
];

function stripThinkingTokens(text: string): string {
  let result = text.trim();

  // Repeatedly strip thinking patterns from the beginning
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of THINKING_PATTERNS) {
      const match = result.match(pattern);
      if (match && result.indexOf(match[0]) === 0) {
        result = result.slice(match[0].length).trim();
        changed = true;
        break;
      }
    }
  }

  return result;
}

function parseTLDRResponse(response: string): TLDRResult {
  const parts = response.split("---DISCUSSION---");

  let articleSummary = stripThinkingTokens(parts[0] || "");
  let discussionSummary = stripThinkingTokens(parts[1] || "");

  // If no separator was found, try to split heuristically
  if (parts.length === 1 && articleSummary.length > 0) {
    // Look for common discussion indicators
    const discussionIndicators = [
      /\n\n(?:The discussion|Discussion|Comments|HN comments|The HN discussion)/i,
      /\n\n(?:Commenters|Users|Readers)/i,
    ];

    for (const indicator of discussionIndicators) {
      const match = articleSummary.match(indicator);
      if (match && match.index !== undefined) {
        discussionSummary = articleSummary.slice(match.index).trim();
        articleSummary = articleSummary.slice(0, match.index).trim();
        break;
      }
    }

    if (!discussionSummary) {
      log("[tldr] Warning: No discussion separator found in response");
    }
  }

  return { articleSummary, discussionSummary };
}

export async function generateTLDR(
  post: HackerNewsPost,
  provider: Provider,
  callbacks: TLDRCallbacks,
): Promise<void> {
  const storyContext = buildStoryContext(post);
  const storyUrl = post.url || "";

  const userPrompt = `Please provide a TLDR for this story and its discussion.

${storyContext}`;

  try {
    if (provider === "anthropic") {
      await generateAnthropicTLDR(storyUrl, userPrompt, callbacks);
    } else {
      await generateOpenAITLDR(storyUrl, userPrompt, callbacks);
    }
  } catch (error) {
    log("[ERROR]", "[tldr] Error generating TLDR:", error);
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

// Web search tool type for Anthropic (beta API - types not yet in SDK)
interface AnthropicWebSearchTool {
  type: "web_search_20250305";
  name: "web_search";
  max_uses: number;
}

async function generateAnthropicTLDR(
  storyUrl: string,
  userPrompt: string,
  callbacks: TLDRCallbacks,
): Promise<void> {
  const apiKey = getApiKey("anthropic");
  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }
  const anthropic = new Anthropic({ apiKey });

  // Use web search to fetch article content if we have a URL
  // Note: web_search_20250305 is a beta tool type not yet fully typed in the SDK.
  // We use 'as unknown as' because the beta tool schema differs from standard tools.
  // TODO: Remove this cast when the SDK adds proper types for web_search tool
  const webSearchTool: AnthropicWebSearchTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 2,
  };
  const tools = storyUrl ? [webSearchTool as unknown as Anthropic.Messages.Tool] : [];

  log("[tldr] Generating TLDR with Anthropic, model:", CHEAP_ANTHROPIC_MODEL);

  const response = await anthropic.messages.create({
    model: CHEAP_ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: TLDR_SYSTEM_PROMPT,
    tools: tools.length > 0 ? tools : undefined,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract text from response
  let tldr = "";
  for (const block of response.content) {
    if (block.type === "text") {
      tldr += block.text;
    }
  }

  log("[tldr] TLDR generated, length:", tldr.length);
  callbacks.onComplete(parseTLDRResponse(tldr));
}

async function generateOpenAITLDR(
  storyUrl: string,
  userPrompt: string,
  callbacks: TLDRCallbacks,
): Promise<void> {
  const apiKey = getApiKey("openai");
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }
  const openai = new OpenAI({ apiKey });

  log("[tldr] Generating TLDR with OpenAI, model:", CHEAP_OPENAI_MODEL);

  // Try Responses API with web search first
  if (storyUrl) {
    try {
      const response = await openai.responses.create({
        model: CHEAP_OPENAI_MODEL,
        tools: [{ type: "web_search" }],
        input: [
          { role: "developer", content: TLDR_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });

      // Extract text from response
      let tldr = "";
      for (const item of response.output) {
        if (item.type === "message" && item.content) {
          for (const block of item.content) {
            if (block.type === "output_text") {
              tldr += block.text;
            }
          }
        }
      }

      log("[tldr] TLDR generated via Responses API, length:", tldr.length);
      callbacks.onComplete(parseTLDRResponse(tldr));
      return;
    } catch (error) {
      // Only fallback for API availability issues, not auth/rate limit errors.
      // Note: This is best-effort detection via error message strings, which may
      // change between API versions. Auth and rate limit errors are re-thrown.
      const isApiAvailabilityError = error instanceof Error && (
        error.message.includes("not found") ||
        error.message.includes("does not exist") ||
        error.message.includes("unsupported")
      );
      if (!isApiAvailabilityError) {
        // Re-throw auth, rate limit, or other critical errors
        throw error;
      }
      log("[tldr] Responses API not available, falling back to chat completions:", error);
    }
  }

  // Fallback to Chat Completions (no web search)
  const response = await openai.chat.completions.create({
    model: CHEAP_OPENAI_MODEL,
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: TLDR_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const tldr = response.choices[0]?.message?.content || "";
  log("[tldr] TLDR generated via Chat Completions, length:", tldr.length);
  callbacks.onComplete(parseTLDRResponse(tldr));
}
