import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  InputRenderable,
  TextareaRenderable,
  type CliRenderer,
  type RenderContext,
} from "@opentui/core";
import { log, logError } from "./logger";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getRankedPosts, getPostById } from "./api";
import type { HackerNewsPost, HackerNewsComment } from "./types";
import {
  type Provider,
  type AnthropicModel,
  type OpenAIModel,
  getConfiguredProvider,
  getApiKey,
  getModel,
  setModel,
  saveConfig,
  loadConfig,
  clearAllApiKeys,
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
} from "./config";
import { type UpdateInfo, getUpdateCommand } from "./version";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Theme definitions for light and dark modes
const DARK_THEME = {
  bg: undefined as string | undefined, // Use terminal default
  bgSelected: "#2a2a2a",
  border: "#3a3a3a",
  text: "#e0e0e0",
  textDim: "#888888",
  textMuted: "#666666",
  textVeryDim: "#444444",
  accent: "#ff6600",
  link: "#6699ff",
  commentL1: "#555555",
  commentL2: "#444444",
  commentL3: "#333333",
};

const LIGHT_THEME = {
  bg: undefined as string | undefined, // Use terminal default
  bgSelected: "#e8e8e8",
  border: "#cccccc",
  text: "#1a1a1a",
  textDim: "#666666",
  textMuted: "#888888",
  textVeryDim: "#aaaaaa",
  accent: "#ff6600",
  link: "#0066cc",
  commentL1: "#cccccc",
  commentL2: "#dddddd",
  commentL3: "#eeeeee",
};

// Default to dark theme, can be changed by detectTheme()
let COLORS = { ...DARK_THEME };

// Helper to detect if terminal has a light background
function isLightBackground(hexColor: string | null): boolean {
  if (!hexColor) return false;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

const HN_BASE_URL = "https://brianlovin.com/hn";

export interface AppCallbacks {
  onOpenUrl?: (url: string) => void;
  onExit?: () => void;
}

export class HackerNewsApp {
  private renderer: CliRenderer;
  private ctx: RenderContext;
  private callbacks: AppCallbacks;

  private posts: HackerNewsPost[] = [];
  private selectedIndex = -1;
  private selectedPost: HackerNewsPost | null = null;
  private rootCommentIndex = 0;

  private contentArea!: BoxRenderable;
  private storyListPanel!: BoxRenderable;
  private storyListScroll!: ScrollBoxRenderable;
  private storyItems: Map<number, BoxRenderable> = new Map();
  private detailPanel!: BoxRenderable;
  private detailHeader!: BoxRenderable;
  private detailScroll!: ScrollBoxRenderable;
  private detailContent!: BoxRenderable;
  private rootCommentBoxes: BoxRenderable[] = [];
  private shortcutsBar!: BoxRenderable;

  // Loading state
  private loadingIndicator: TextRenderable | null = null;
  private loadingInterval: ReturnType<typeof setInterval> | null = null;
  private loadingFrame = 0;
  private static readonly LOADING_CHARS = [
    "⠋",
    "⠙",
    "⠹",
    "⠸",
    "⠼",
    "⠴",
    "⠦",
    "⠧",
    "⠇",
    "⠏",
  ];

  // Chat state
  private chatMode = false;
  private chatMessages: ChatMessage[] = [];
  private chatPanel: BoxRenderable | null = null;
  private chatScroll: ScrollBoxRenderable | null = null;
  private chatContent: BoxRenderable | null = null;
  private chatInput: TextareaRenderable | null = null;
  private chatStoryContext: string = "";
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private chatProvider: Provider = "anthropic";
  private isStreaming = false;

  // Auth setup state
  private authSetupMode = false;
  private authSetupStep: "provider" | "key" = "provider";
  private authSelectedProvider: Provider = "anthropic";
  private authKeyInput: InputRenderable | null = null;

  // Settings state
  private settingsMode = false;
  private settingsSection: "main" | "model" = "main";
  private settingsSelectedIndex = 0;
  private settingsModelProvider: Provider = "anthropic";

  // Chat suggestions state
  private suggestions: string[] = [];
  private originalSuggestions: string[] = []; // Keep original for restoring
  private selectedSuggestionIndex = -1;
  private suggestionsGenerated = false;
  private suggestionsLoading = false;
  private suggestionsContainer: BoxRenderable | null = null;

  // Update notification state
  private updateInfo: UpdateInfo | null = null;

  constructor(renderer: CliRenderer, callbacks: AppCallbacks = {}) {
    this.renderer = renderer;
    this.ctx = renderer;
    this.callbacks = callbacks;
  }

  async initialize() {
    // Detect terminal theme before setting up layout
    await this.detectTheme();
    this.setupLayout();
    this.setupKeyboardHandlers();
    await this.loadPosts();
  }

  // For testing: initialize layout only without loading data
  initializeForTesting() {
    // Use dark theme for testing
    this.setupLayout();
    this.setupKeyboardHandlers();
  }

  private async detectTheme() {
    try {
      const palette = await this.renderer.getPalette({ timeout: 100 });
      if (
        palette.defaultBackground &&
        isLightBackground(palette.defaultBackground)
      ) {
        COLORS = { ...LIGHT_THEME };
      }
    } catch {
      // If detection fails, keep dark theme (default)
    }
  }

  /**
   * Set update info from background version check.
   * Re-renders empty state if no story is selected.
   */
  setUpdateInfo(info: UpdateInfo) {
    this.updateInfo = info;
    // Re-render empty state if no story is selected
    if (this.selectedIndex === -1 && !this.chatMode && !this.authSetupMode && !this.settingsMode) {
      this.renderEmptyDetail();
    }
  }

  private setupLayout() {
    const mainContainer = new BoxRenderable(this.ctx, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: COLORS.bg,
      paddingTop: 1,
    });

    const header = this.createHeader();
    const content = this.createContentArea();

    mainContainer.add(header);
    mainContainer.add(content);

    this.renderer.root.add(mainContainer);
  }

  private createHeader(): BoxRenderable {
    const header = new BoxRenderable(this.ctx, {
      width: "100%",
      height: 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingLeft: 2,
      paddingRight: 2,
      backgroundColor: COLORS.bg,
      borderStyle: "single",
      border: ["bottom"],
      borderColor: COLORS.border,
    });

    const title = new TextRenderable(this.ctx, {
      content: "Hacker News",
      fg: COLORS.accent,
    });
    header.add(title);

    // Right side container with loading indicator + GitHub link
    const rightContainer = new BoxRenderable(this.ctx, {
      flexDirection: "row",
      gap: 2,
      alignItems: "center",
    });

    // Loading indicator (hidden initially by being empty)
    this.loadingIndicator = new TextRenderable(this.ctx, {
      content: "",
      fg: COLORS.textDim,
    });
    rightContainer.add(this.loadingIndicator);

    // GitHub link
    const githubLink = new TextRenderable(this.ctx, {
      content: "brianlovin/hn-cli",
      fg: COLORS.textDim,
      onMouseDown: () => {
        this.callbacks.onOpenUrl?.("https://github.com/brianlovin/hn-cli");
      },
      onMouseOver: () => {
        (githubLink as any).fg = COLORS.link;
      },
      onMouseOut: () => {
        (githubLink as any).fg = COLORS.textDim;
      },
    });
    rightContainer.add(githubLink);

    header.add(rightContainer);

    return header;
  }

  private startLoadingAnimation() {
    if (this.loadingInterval) return;

    this.loadingFrame = 0;
    this.loadingInterval = setInterval(() => {
      if (this.loadingIndicator && !this.renderer.isDestroyed) {
        const char = HackerNewsApp.LOADING_CHARS[this.loadingFrame] ?? "⠋";
        this.loadingIndicator.content = char;
        this.loadingFrame =
          (this.loadingFrame + 1) % HackerNewsApp.LOADING_CHARS.length;
      }
    }, 80);
  }

  private stopLoadingAnimation() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
    if (this.loadingIndicator) {
      this.loadingIndicator.content = "";
    }
  }

  private createContentArea(): BoxRenderable {
    this.contentArea = new BoxRenderable(this.ctx, {
      id: "content-area",
      width: "100%",
      flexGrow: 1,
      flexDirection: "row",
    });

    const leftPanel = this.createStoryList();
    const rightPanel = this.createDetailPanel();

    this.contentArea.add(leftPanel);
    this.contentArea.add(rightPanel);

    return this.contentArea;
  }

  private createStoryList(): BoxRenderable {
    this.storyListPanel = new BoxRenderable(this.ctx, {
      id: "story-list-panel",
      width: "35%",
      height: "100%",
      flexDirection: "column",
      borderStyle: "single",
      border: ["right"],
      borderColor: COLORS.border,
      backgroundColor: COLORS.bg,
      paddingLeft: 1,
      paddingBottom: 1,
    });

    this.storyListScroll = new ScrollBoxRenderable(this.ctx, {
      width: "100%",
      flexGrow: 1,
      scrollY: true,
      backgroundColor: COLORS.bg,
      contentOptions: {
        flexDirection: "column",
        backgroundColor: COLORS.bg,
      },
    });

    this.storyListPanel.add(this.storyListScroll);

    return this.storyListPanel;
  }

  private createDetailPanel(): BoxRenderable {
    this.detailPanel = new BoxRenderable(this.ctx, {
      width: "65%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: COLORS.bg,
    });

    // Detail header (stays fixed, outside scroll)
    this.detailHeader = new BoxRenderable(this.ctx, {
      id: "detail-header",
      width: "100%",
      flexDirection: "column",
      flexShrink: 0,
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      borderStyle: "single",
      border: ["bottom"],
      borderColor: COLORS.border,
      backgroundColor: COLORS.bg,
    });

    this.detailScroll = new ScrollBoxRenderable(this.ctx, {
      width: "100%",
      flexGrow: 1,
      scrollY: true,
      backgroundColor: COLORS.bg,
      contentOptions: {
        flexDirection: "column",
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        backgroundColor: COLORS.bg,
      },
    });

    this.detailContent = new BoxRenderable(this.ctx, {
      width: "100%",
      flexDirection: "column",
      backgroundColor: COLORS.bg,
    });

    this.detailScroll.add(this.detailContent);
    this.detailPanel.add(this.detailHeader);
    this.detailPanel.add(this.detailScroll);

    // Keyboard shortcuts bar at bottom
    this.shortcutsBar = this.createShortcutsBar();
    this.detailPanel.add(this.shortcutsBar);

    return this.detailPanel;
  }

  private createChatPanel() {
    // Create chat scroll area
    this.chatScroll = new ScrollBoxRenderable(this.ctx, {
      width: "100%",
      flexGrow: 1,
      scrollY: true,
      backgroundColor: COLORS.bg,
      contentOptions: {
        flexDirection: "column",
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        backgroundColor: COLORS.bg,
      },
    });

    this.chatContent = new BoxRenderable(this.ctx, {
      width: "100%",
      flexDirection: "column",
      backgroundColor: COLORS.bg,
    });

    this.chatScroll.add(this.chatContent);

    // Create suggestions container (appears above input)
    this.suggestionsContainer = new BoxRenderable(this.ctx, {
      id: "suggestions-container",
      width: "100%",
      flexDirection: "column",
      flexShrink: 0, // Don't shrink - preserve natural height for suggestions
      paddingLeft: 2,
      paddingRight: 2,
      backgroundColor: COLORS.bg,
    });

    // Create input area
    const inputContainer = new BoxRenderable(this.ctx, {
      width: "100%",
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      paddingLeft: 2,
      paddingRight: 2,
      backgroundColor: COLORS.bg,
      borderStyle: "single",
      border: ["top"],
      borderColor: COLORS.border,
    });

    const promptLabel = new TextRenderable(this.ctx, {
      content: "› ",
      fg: COLORS.accent,
    });
    inputContainer.add(promptLabel);

    this.chatInput = new TextareaRenderable(this.ctx, {
      width: "100%",
      flexGrow: 1,
      minHeight: 1,
      maxHeight: 5,
      wrapMode: "word",
      placeholder: "Ask a question about this story...",
      backgroundColor: COLORS.bg,
      keyBindings: [
        // Shift+Enter for new line (must be before plain return to match first)
        { name: "return", shift: true, action: "newline" },
        // Enter to submit
        { name: "return", action: "submit" },
      ],
    });

    // Handle Enter key - submit if there's content, or select suggestion, or do nothing
    this.chatInput.on("submit", () => {
      // If there's text in the input, send it
      if (this.chatInput && this.chatInput.plainText.trim()) {
        this.sendChatMessage();
        return;
      }
      // If no text but a suggestion is selected, send the suggestion
      if (this.selectedSuggestionIndex >= 0 && this.suggestions.length > 0) {
        this.selectSuggestion();
        return;
      }
      // Otherwise do nothing (empty input, no suggestion)
    });

    inputContainer.add(this.chatInput);

    // Create shortcuts bar for chat
    const chatShortcutsBar = this.createChatShortcutsBar();

    // Create chat panel container
    this.chatPanel = new BoxRenderable(this.ctx, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: COLORS.bg,
    });

    // Add header showing we're chatting about this story (matches story detail header)
    const chatHeader = new BoxRenderable(this.ctx, {
      width: "100%",
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
      borderStyle: "single",
      border: ["bottom"],
      borderColor: COLORS.border,
      backgroundColor: COLORS.bg,
    });

    // Title (same style as story detail header)
    const post = this.selectedPost;
    if (post) {
      const titleText = new TextRenderable(this.ctx, {
        content: post.title,
        fg: COLORS.text,
        wrapMode: "word",
        onMouseDown: () => this.openStoryUrl(),
        onMouseOver: () => {
          (titleText as any).fg = COLORS.link;
        },
        onMouseOut: () => {
          (titleText as any).fg = COLORS.text;
        },
      });
      chatHeader.add(titleText);

      // Domain (same style as story detail header)
      if (post.domain) {
        const domainText = new TextRenderable(this.ctx, {
          content: post.domain,
          fg: COLORS.textDim,
          marginTop: 1, // Force separation from title
          onMouseDown: () => this.openStoryUrl(),
        });
        chatHeader.add(domainText);
      }
    }

    this.chatPanel.add(chatHeader);
    this.chatPanel.add(this.chatScroll);
    this.chatPanel.add(this.suggestionsContainer);
    this.chatPanel.add(inputContainer);
    this.chatPanel.add(chatShortcutsBar);
  }

  private createChatShortcutsBar(): BoxRenderable {
    const bar = new BoxRenderable(this.ctx, {
      width: "100%",
      height: 3,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 2,
      paddingRight: 2,
      paddingBottom: 1,
      backgroundColor: COLORS.bg,
      borderStyle: "single",
      border: ["top"],
      borderColor: COLORS.border,
      gap: 2,
    });

    const shortcuts = [
      { key: ",", desc: "settings" },
      { key: "esc", desc: "close" },
    ];

    shortcuts.forEach(({ key, desc }) => {
      const shortcut = new BoxRenderable(this.ctx, {
        flexDirection: "row",
        gap: 1,
      });

      const keyText = new TextRenderable(this.ctx, {
        content: key,
        fg: COLORS.accent,
      });

      const descText = new TextRenderable(this.ctx, {
        content: desc,
        fg: COLORS.textDim,
      });

      shortcut.add(keyText);
      shortcut.add(descText);
      bar.add(shortcut);
    });

    return bar;
  }

  private showChatView() {
    if (!this.selectedPost) return;

    this.chatMode = true;
    this.chatMessages = [];
    this.suggestions = [];
    this.selectedSuggestionIndex = -1;
    this.suggestionsGenerated = false;
    this.suggestionsLoading = true;

    // Hide story list panel and expand detail panel to full width
    this.contentArea.remove(this.storyListPanel.id);
    (this.detailPanel as any).width = "100%";

    // Remove detail view components
    this.detailPanel.remove(this.detailHeader.id);
    this.detailPanel.remove(this.detailScroll.id);
    this.detailPanel.remove(this.shortcutsBar.id);

    // Create and add chat panel
    this.createChatPanel();
    if (this.chatPanel) {
      // Add chat panel children directly to detail panel
      for (const child of this.chatPanel.getChildren()) {
        this.detailPanel.add(child);
      }
    }

    // Focus the input after a delay to prevent 'c' from being captured
    setTimeout(() => {
      if (this.chatInput) {
        this.chatInput.focus();
        this.chatInput.clear();
      }
    }, 10);

    // Add initial assistant message
    this.addChatMessage(
      "assistant",
      `I have the full context of "${this.selectedPost.title}" and all ${this.selectedPost.comments_count} comments. Ask me anything!`,
    );

    // Show loading state and generate dynamic suggestions
    this.renderSuggestions();
    this.generateSuggestions();
  }

  private hideChatView() {
    if (!this.chatMode) return;

    this.chatMode = false;

    // Blur the chat input to hide cursor
    if (this.chatInput) {
      this.chatInput.blur();
    }

    // Show story list panel and restore detail panel width
    // Remove detail panel first, add story list, then re-add detail panel
    this.contentArea.remove(this.detailPanel.id);
    this.contentArea.add(this.storyListPanel);
    this.contentArea.add(this.detailPanel);
    (this.detailPanel as any).width = "65%";

    // Remove chat components
    for (const child of this.detailPanel.getChildren()) {
      this.detailPanel.remove(child.id);
    }

    // Re-add detail view components
    this.detailPanel.add(this.detailHeader);
    this.detailPanel.add(this.detailScroll);
    this.detailPanel.add(this.shortcutsBar);

    // Re-render the current story if we have one
    if (this.selectedPost) {
      this.renderDetail(this.selectedPost);
    }
  }

  private addChatMessage(role: "user" | "assistant", content: string) {
    this.chatMessages.push({ role, content });
    this.renderChatMessages();
  }

  private renderChatMessages() {
    if (!this.chatContent) return;

    // Clear existing messages
    for (const child of this.chatContent.getChildren()) {
      this.chatContent.remove(child.id);
    }

    // Render each message
    for (const msg of this.chatMessages) {
      const msgBox = new BoxRenderable(this.ctx, {
        width: "100%",
        flexDirection: "column",
        marginBottom: 1,
      });

      const assistantName =
        this.chatProvider === "anthropic" ? "Claude" : "GPT";
      const roleLabel = new TextRenderable(this.ctx, {
        content: msg.role === "user" ? "You" : assistantName,
        fg: msg.role === "user" ? COLORS.accent : COLORS.link,
      });
      msgBox.add(roleLabel);

      const contentText = new TextRenderable(this.ctx, {
        content: msg.content,
        fg: COLORS.text,
        wrapMode: "word",
      });
      msgBox.add(contentText);

      this.chatContent.add(msgBox);
    }

    // Scroll to bottom
    if (this.chatScroll) {
      this.chatScroll.scrollTop = this.chatScroll.scrollHeight;
    }
  }

  private async sendChatMessage() {
    if (!this.chatInput || this.isStreaming) return;

    const userMessage = this.chatInput.plainText.trim();
    if (!userMessage) return;

    // Clear input
    this.chatInput.clear();

    // Add user message to chat
    this.addChatMessage("user", userMessage);

    // Build system context if first message
    if (!this.chatStoryContext && this.selectedPost) {
      this.chatStoryContext = this.buildStoryContext(this.selectedPost);
    }

    // Send to Claude
    await this.streamAIResponse(userMessage);
  }

  private buildStoryContext(post: HackerNewsPost): string {
    const storyUrl =
      post.url || `https://news.ycombinator.com/item?id=${post.id}`;

    let context = `# Hacker News Story\n\n`;
    context += `**Title:** ${post.title}\n`;
    context += `**URL:** ${storyUrl}\n`;
    if (post.domain) context += `**Domain:** ${post.domain}\n`;
    if (post.points) context += `**Points:** ${post.points}\n`;
    if (post.user) context += `**Posted by:** ${post.user}\n`;
    context += `**Comments:** ${post.comments_count}\n\n`;

    if (post.content) {
      context += `## Story Content\n\n${this.stripHtml(post.content)}\n\n`;
    }

    if (post.comments && post.comments.length > 0) {
      context += `## Comments\n\n`;
      context += this.formatCommentsForContext(post.comments);
    }

    return context;
  }

  private formatCommentsForContext(
    comments: HackerNewsComment[],
    depth = 0,
  ): string {
    let result = "";
    const indent = "  ".repeat(depth);

    for (const comment of comments) {
      if (comment.user && comment.content) {
        const content = this.stripHtml(comment.content);
        result += `${indent}**${comment.user}:**\n`;
        const indentedContent = content
          .split("\n")
          .map((line) => `${indent}${line}`)
          .join("\n");
        result += `${indentedContent}\n\n`;

        if (comment.comments && comment.comments.length > 0) {
          result += this.formatCommentsForContext(comment.comments, depth + 1);
        }
      }
    }

    return result;
  }

  private async streamAIResponse(userMessage: string) {
    this.isStreaming = true;

    // Add placeholder for streaming response
    const assistantMsgIndex = this.chatMessages.length;
    this.addChatMessage("assistant", "...");

    const storyUrl = this.selectedPost?.url || "";
    const systemPrompt = `You are helping a user understand and discuss a Hacker News story and its comments. Here is the full context:

${this.chatStoryContext}

---

The user is reading this in a terminal app and wants to discuss it with you. Be concise but insightful. If they ask about the article content and it would help to have more context, you can suggest they share more details or you can work with what's in the comments.

${storyUrl ? `The original article URL is: ${storyUrl}` : ""}`;

    try {
      if (this.chatProvider === "anthropic") {
        await this.streamAnthropicResponse(
          userMessage,
          systemPrompt,
          assistantMsgIndex,
        );
      } else {
        await this.streamOpenAIResponse(
          userMessage,
          systemPrompt,
          assistantMsgIndex,
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      const providerName =
        this.chatProvider === "anthropic" ? "Anthropic" : "OpenAI";
      if (this.chatMessages[assistantMsgIndex]) {
        this.chatMessages[assistantMsgIndex].content =
          `Error: ${errorMsg}\n\nCheck your ${providerName} API key in ~/.config/hn-cli/config.json`;
        this.renderChatMessages();
      }
    }

    this.isStreaming = false;
  }

  private async streamAnthropicResponse(
    userMessage: string,
    systemPrompt: string,
    assistantMsgIndex: number,
  ) {
    // Initialize Anthropic client if needed
    if (!this.anthropic) {
      const apiKey = getApiKey("anthropic");
      this.anthropic = new Anthropic({ apiKey });
    }

    const stream = this.anthropic.messages.stream({
      model: getModel("anthropic") as string,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.chatMessages
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
      if (this.chatMessages[assistantMsgIndex]) {
        this.chatMessages[assistantMsgIndex].content = fullResponse;
        this.renderChatMessages();
      }
    });

    await stream.finalMessage();
  }

  private async streamOpenAIResponse(
    userMessage: string,
    systemPrompt: string,
    assistantMsgIndex: number,
  ) {
    log("[openai-stream] Starting stream...");

    // Initialize OpenAI client if needed
    if (!this.openai) {
      const apiKey = getApiKey("openai");
      log("[openai-stream] Initializing client, API key exists:", !!apiKey);
      this.openai = new OpenAI({ apiKey });
    }

    const model = getModel("openai") as string;
    log("[openai-stream] Model:", model);
    log("[openai-stream] Message count:", this.chatMessages.length);

    const stream = await this.openai.chat.completions.create({
      model,
      max_completion_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...this.chatMessages.slice(0, -1).map((m) => ({
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
        if (this.chatMessages[assistantMsgIndex]) {
          this.chatMessages[assistantMsgIndex].content = fullResponse;
          this.renderChatMessages();
        }
      }
    }

    log(
      "[openai-stream] Stream complete, response length:",
      fullResponse.length,
    );
  }

  private createShortcutsBar(): BoxRenderable {
    const bar = new BoxRenderable(this.ctx, {
      width: "100%",
      height: 3,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 2,
      paddingRight: 2,
      paddingBottom: 1,
      backgroundColor: COLORS.bg,
      borderStyle: "single",
      border: ["top"],
      borderColor: COLORS.border,
      gap: 2,
    });

    const shortcuts = [
      { key: "j/k", desc: "stories" },
      { key: "⌘j/k", desc: "comments" },
      { key: "o", desc: "open" },
      { key: "c", desc: "chat" },
      { key: "q", desc: "quit" },
    ];

    shortcuts.forEach(({ key, desc }) => {
      const shortcut = new BoxRenderable(this.ctx, {
        flexDirection: "row",
        gap: 1,
      });

      const keyText = new TextRenderable(this.ctx, {
        content: key,
        fg: COLORS.accent,
      });

      const descText = new TextRenderable(this.ctx, {
        content: desc,
        fg: COLORS.textDim,
      });

      shortcut.add(keyText);
      shortcut.add(descText);
      bar.add(shortcut);
    });

    return bar;
  }

  private setupKeyboardHandlers() {
    this.renderer.keyInput.on("keypress", (key) => {
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        this.callbacks.onExit?.();
        return;
      }

      // Settings mode handlers
      if (this.settingsMode) {
        if (key.name === "escape") {
          if (this.settingsSection === "model") {
            this.settingsSection = "main";
            this.settingsSelectedIndex = 0;
            this.renderSettings();
          } else {
            this.hideSettings();
          }
          return;
        }

        if (key.name === "j" || key.name === "down") {
          this.navigateSettings(1);
        } else if (key.name === "k" || key.name === "up") {
          this.navigateSettings(-1);
        } else if (key.name === "return" || key.name === "enter") {
          this.selectSettingsItem();
        }
        return;
      }

      // Auth setup mode handlers
      if (this.authSetupMode) {
        if (key.name === "escape") {
          this.hideAuthSetup();
          return;
        }

        // Provider selection step
        if (this.authSetupStep === "provider") {
          if (key.name === "j" || key.name === "down") {
            this.authSelectedProvider = "openai";
            this.renderAuthSetup();
          } else if (key.name === "k" || key.name === "up") {
            this.authSelectedProvider = "anthropic";
            this.renderAuthSetup();
          } else if (key.name === "return" || key.name === "enter") {
            this.authSetupStep = "key";
            this.renderAuthSetup();
          }
        }
        // Key input step is handled by the input itself
        return;
      }

      // Chat mode handlers
      if (this.chatMode) {
        // Escape to close chat
        if (key.name === "escape") {
          this.hideChatView();
          return;
        }

        // Comma to open settings
        if (key.name === "," || key.sequence === ",") {
          this.showSettings();
          return;
        }

        // Suggestion navigation when input is empty
        if (
          this.suggestions.length > 0 &&
          this.chatInput &&
          !this.chatInput.plainText.trim()
        ) {
          if (key.name === "up" || key.name === "k") {
            this.navigateSuggestion(-1);
            return;
          } else if (key.name === "down" || key.name === "j") {
            this.navigateSuggestion(1);
            return;
          }
        }

        // Handle Enter key for chat submission (but not shift+enter which is newline)
        if ((key.name === "return" || key.name === "enter") && !key.shift) {
          // If there's text in the input, send it
          if (this.chatInput && this.chatInput.plainText.trim()) {
            this.sendChatMessage();
            return;
          }
          // If no text but a suggestion is selected, send the suggestion
          if (
            this.selectedSuggestionIndex >= 0 &&
            this.suggestions.length > 0
          ) {
            this.selectSuggestion();
            return;
          }
          // Otherwise do nothing (empty input, no suggestion)
          return;
        }

        // Clear suggestions when user starts typing (any printable character)
        if (
          this.suggestions.length > 0 &&
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta
        ) {
          const charCode = key.sequence.charCodeAt(0);
          // Printable ASCII characters (space to tilde)
          if (charCode >= 32 && charCode <= 126) {
            this.suggestions = [];
            this.selectedSuggestionIndex = -1;
            this.renderSuggestions();
          }
        }

        // Restore suggestions when backspace clears the input
        if (
          key.name === "backspace" &&
          this.chatInput &&
          this.originalSuggestions.length > 0
        ) {
          // Check after a tick if input is now empty
          setTimeout(() => {
            if (
              this.chatInput &&
              !this.chatInput.plainText.trim() &&
              this.suggestions.length === 0
            ) {
              this.suggestions = [...this.originalSuggestions];
              this.selectedSuggestionIndex = this.suggestions.length - 1;
              this.renderSuggestions();
            }
          }, 10);
        }

        // Let the input handle other keys
        return;
      }

      // Check for cmd/super modifier (Command key on macOS with Kitty keyboard)
      const hasCmdMod = key.super;

      // Story navigation: j/k without cmd key
      if (key.name === "j" && !hasCmdMod) {
        this.navigateStory(1);
      } else if (key.name === "k" && !hasCmdMod) {
        this.navigateStory(-1);
      }
      // Comment navigation: cmd+j/k
      else if (key.name === "j" && hasCmdMod) {
        this.navigateToNextComment();
      } else if (key.name === "k" && hasCmdMod) {
        this.navigateToPreviousComment();
      }
      // Open URL: 'o' key
      else if (key.name === "o") {
        this.openStoryUrl();
      }
      // Chat with AI about this story: 'c' key
      else if (key.name === "c") {
        this.openChat();
      } else if (key.name === "r") {
        this.refresh();
      }
    });
  }

  private async loadPosts() {
    this.startLoadingAnimation();
    try {
      this.posts = await getRankedPosts();
      this.stopLoadingAnimation();
      this.renderStoryList();
      this.renderEmptyDetail();
    } catch (error) {
      this.stopLoadingAnimation();
      log("[ERROR]", "Error loading posts:", error);
    }
  }

  private renderStoryList() {
    // Clear existing items
    for (const child of this.storyListScroll.getChildren()) {
      this.storyListScroll.remove(child.id);
    }
    this.storyItems.clear();

    this.posts.forEach((post, index) => {
      const item = this.createStoryItem(post, index);
      this.storyItems.set(index, item);
      this.storyListScroll.add(item);
    });
  }

  private createStoryItem(post: HackerNewsPost, index: number): BoxRenderable {
    const isSelected = index === this.selectedIndex;

    const item = new BoxRenderable(this.ctx, {
      id: `story-${post.id}`,
      width: "100%",
      paddingTop: 0,
      paddingBottom: 0,
      backgroundColor: COLORS.bg,
      flexDirection: "row",
      // Make clickable
      onMouseDown: () => {
        this.selectStory(index);
      },
    });

    // Chevron indicator column
    const chevronIndicator = new TextRenderable(this.ctx, {
      id: `chevron-${post.id}`,
      content: isSelected ? "›" : " ",
      fg: isSelected ? COLORS.accent : COLORS.textVeryDim,
      width: 2,
      paddingLeft: 1,
    });
    item.add(chevronIndicator);

    // Content area
    const content = new BoxRenderable(this.ctx, {
      id: `content-${post.id}`,
      flexGrow: 1,
      flexDirection: "column",
      paddingRight: 2,
    });
    item.add(content);

    // Title (truncated to ~2 lines worth of characters)
    const maxTitleLength = 80;
    const titleText = new TextRenderable(this.ctx, {
      id: `title-${post.id}`,
      content: this.truncateText(post.title, maxTitleLength),
      fg: isSelected ? COLORS.accent : COLORS.text,
      maxHeight: 2,
    });
    content.add(titleText);

    // Domain on separate line (lighter gray)
    if (post.domain) {
      const domainText = new TextRenderable(this.ctx, {
        id: `domain-${post.id}`,
        content: post.domain,
        fg: COLORS.textDim,
      });
      content.add(domainText);
    }

    return item;
  }

  async selectStory(index: number) {
    if (index < 0 || index >= this.posts.length) return;
    if (this.renderer.isDestroyed) return;

    const previousIndex = this.selectedIndex;
    this.selectedIndex = index;
    this.rootCommentIndex = 0;

    // Update visual state of previous and new selection
    this.updateStoryItemStyle(previousIndex, false);
    this.updateStoryItemStyle(index, true);

    const post = this.posts[index];
    if (!post) return;

    try {
      const fullPost = await getPostById(post.id);
      if (this.renderer.isDestroyed) return;
      if (fullPost) {
        this.selectedPost = fullPost;
        this.renderDetail(fullPost);
      }
    } catch (error) {
      log("[ERROR]", "Error loading post:", error);
    }

    if (this.renderer.isDestroyed) return;

    // Scroll story list to keep selected item visible (only when necessary)
    const itemHeight = 2; // Each story item is ~2 lines
    const itemTop = index * itemHeight;
    const itemBottom = itemTop + itemHeight;
    const viewportHeight = this.storyListScroll.height;
    const currentScroll = this.storyListScroll.scrollTop;

    // Only scroll if the item is outside the visible viewport
    if (itemTop < currentScroll) {
      // Item is above viewport - scroll up to show it at top
      this.storyListScroll.scrollTop = itemTop;
    } else if (itemBottom > currentScroll + viewportHeight) {
      // Item is below viewport - scroll down to show it at bottom
      this.storyListScroll.scrollTop = itemBottom - viewportHeight;
    }
    // Otherwise, item is already visible - don't scroll
  }

  private updateStoryItemStyle(index: number, isSelected: boolean) {
    const item = this.storyItems.get(index);
    if (!item) return;

    const post = this.posts[index];
    if (!post) return;

    const children = item.getChildren();
    // children[0] = chevron indicator, children[1] = content box
    if (children.length >= 2) {
      // Update chevron indicator
      const chevronIndicator = children[0] as TextRenderable;
      if (chevronIndicator && "content" in chevronIndicator) {
        chevronIndicator.content = isSelected ? "›" : " ";
        (chevronIndicator as any).fg = isSelected
          ? COLORS.accent
          : COLORS.textVeryDim;
      }

      // Update title color (inside content box)
      const contentBox = children[1] as BoxRenderable;
      const contentChildren = contentBox.getChildren();
      if (contentChildren.length > 0) {
        const titleText = contentChildren[0] as TextRenderable;
        if (titleText && "content" in titleText) {
          (titleText as any).fg = isSelected ? COLORS.accent : COLORS.text;
        }
      }
    }
  }

  private renderDetail(post: HackerNewsPost) {
    // Clear existing header content
    for (const child of this.detailHeader.getChildren()) {
      this.detailHeader.remove(child.id);
    }

    // Clear existing scroll content
    for (const child of this.detailContent.getChildren()) {
      this.detailContent.remove(child.id);
    }
    this.rootCommentBoxes = [];

    // Render title into fixed header (outside scroll)
    // Title clamped to 2 lines with flexShrink: 0 to prevent interleaving
    const titleText = new TextRenderable(this.ctx, {
      content: post.title,
      fg: COLORS.text,
      wrapMode: "word",
      flexShrink: 0,
      maxHeight: 2,
      onMouseDown: () => this.openStoryUrl(),
      onMouseOver: () => {
        (titleText as any).fg = COLORS.link;
      },
      onMouseOut: () => {
        (titleText as any).fg = COLORS.text;
      },
    });
    this.detailHeader.add(titleText);

    // Domain (clickable, lighter gray to match sidebar)
    if (post.domain) {
      const urlText = new TextRenderable(this.ctx, {
        content: post.domain,
        fg: COLORS.textDim,
        flexShrink: 0,
        maxHeight: 1,
        onMouseDown: () => this.openStoryUrl(),
      });
      this.detailHeader.add(urlText);
    }

    // Post content if exists
    if (post.content) {
      const contentBox = new BoxRenderable(this.ctx, {
        width: "100%",
        marginBottom: 1,
      });
      const contentText = new TextRenderable(this.ctx, {
        content: this.stripHtml(post.content),
        fg: COLORS.text,
        wrapMode: "word",
      });
      contentBox.add(contentText);
      this.detailContent.add(contentBox);
    }

    // Comments section
    const commentsSection = new BoxRenderable(this.ctx, {
      width: "100%",
      flexDirection: "column",
    });

    // Comments header with count
    const commentsHeader = new TextRenderable(this.ctx, {
      content: `${post.comments_count} comments`,
      fg: COLORS.textDim,
    });
    commentsSection.add(commentsHeader);

    // Comments
    if (post.comments && post.comments.length > 0) {
      post.comments.forEach((comment, idx) => {
        const commentBox = this.renderComment(comment, idx);
        commentsSection.add(commentBox);
        // Track root comment boxes for navigation
        if (comment.level === 0) {
          this.rootCommentBoxes.push(commentBox);
        }
      });
    } else {
      const noComments = new TextRenderable(this.ctx, {
        content: "No comments yet...",
        fg: COLORS.textDim,
      });
      commentsSection.add(noComments);
    }

    this.detailContent.add(commentsSection);

    // Reset scroll position
    this.detailScroll.scrollTop = 0;
  }

  private renderEmptyDetail() {
    // Clear existing header content
    for (const child of this.detailHeader.getChildren()) {
      this.detailHeader.remove(child.id);
    }

    // Clear existing scroll content
    for (const child of this.detailContent.getChildren()) {
      this.detailContent.remove(child.id);
    }

    // Show empty state message in header
    const emptyMessage = new TextRenderable(this.ctx, {
      content: "Select a story to view details",
      fg: COLORS.textDim,
    });
    this.detailHeader.add(emptyMessage);

    // Show update notification if available
    if (this.updateInfo?.hasUpdate) {
      const updateContainer = new BoxRenderable(this.ctx, {
        width: "100%",
        flexDirection: "column",
        paddingTop: 2,
      });

      const updateMessage = new TextRenderable(this.ctx, {
        content: `Update available: v${this.updateInfo.currentVersion} → v${this.updateInfo.latestVersion}`,
        fg: COLORS.accent,
      });
      updateContainer.add(updateMessage);

      const updateCommand = new TextRenderable(this.ctx, {
        content: getUpdateCommand(),
        fg: COLORS.textDim,
      });
      updateContainer.add(updateCommand);

      this.detailContent.add(updateContainer);
    }
  }

  private renderComment(
    comment: HackerNewsComment,
    rootIndex?: number,
  ): BoxRenderable {
    const isRootComment = comment.level === 0;

    // Border colors: root comments are always orange, nested get progressively lighter
    const borderColors: Record<number, string> = {
      0: COLORS.accent, // Root comments always orange
      1: COLORS.commentL1,
      2: COLORS.commentL2,
      3: COLORS.commentL3,
    };

    const borderColor = borderColors[comment.level] ?? COLORS.commentL3;

    // Use a wrapper for indentation to properly constrain width
    const wrapper = new BoxRenderable(this.ctx, {
      id: `comment-wrapper-${comment.id}`,
      width: "100%",
      marginTop: 1,
      flexDirection: "row",
    });

    // Indent spacer (if nested)
    if (comment.level > 0) {
      const spacer = new BoxRenderable(this.ctx, {
        width: comment.level * 2,
        flexShrink: 0,
      });
      wrapper.add(spacer);
    }

    // Actual comment container with border
    const container = new BoxRenderable(this.ctx, {
      id: `comment-${comment.id}`,
      flexGrow: 1,
      flexShrink: 1,
      paddingLeft: 1,
      paddingRight: 1,
      borderStyle: "single",
      border: ["left"],
      borderColor: borderColor,
      flexDirection: "column",
    });

    // Author - root comments get orange accent color
    const authorText = new TextRenderable(this.ctx, {
      content: comment.user || "[deleted]",
      fg: isRootComment ? COLORS.accent : COLORS.textDim,
    });
    container.add(authorText);

    // Content - use word wrapping for proper text flow
    if (comment.content) {
      const contentText = new TextRenderable(this.ctx, {
        content: this.stripHtml(comment.content),
        fg: COLORS.text,
        wrapMode: "word",
      });
      container.add(contentText);
    } else if (comment.deleted) {
      const deletedText = new TextRenderable(this.ctx, {
        content: "[deleted]",
        fg: COLORS.textMuted,
      });
      container.add(deletedText);
    }

    wrapper.add(container);

    // Nested comments go in the wrapper to maintain proper indentation chain
    if (comment.comments && comment.comments.length > 0) {
      const nestedContainer = new BoxRenderable(this.ctx, {
        width: "100%",
        flexDirection: "column",
      });

      comment.comments.forEach((child) => {
        const childComment = this.renderComment(child);
        nestedContainer.add(childComment);
      });

      // Add nested comments after the wrapper
      const outerWrapper = new BoxRenderable(this.ctx, {
        width: "100%",
        flexDirection: "column",
      });
      outerWrapper.add(wrapper);
      outerWrapper.add(nestedContainer);
      return outerWrapper;
    }

    return wrapper;
  }

  private navigateStory(delta: number) {
    if (this.posts.length === 0) return;

    // Handle first navigation when no story is selected
    if (this.selectedIndex === -1) {
      if (delta > 0) {
        // j pressed: select first story
        this.selectStory(0);
      } else {
        // k pressed: select last story
        this.selectStory(this.posts.length - 1);
      }
      return;
    }

    const newIndex = this.selectedIndex + delta;
    if (newIndex >= 0 && newIndex < this.posts.length) {
      this.selectStory(newIndex);
    }
  }

  private navigateToNextComment() {
    if (!this.selectedPost) return;
    if (this.rootCommentBoxes.length === 0) return;

    const maxIndex = this.rootCommentBoxes.length - 1;
    if (this.rootCommentIndex < maxIndex) {
      this.rootCommentIndex++;
      this.scrollToRootComment(this.rootCommentIndex);
    }
  }

  private navigateToPreviousComment() {
    if (!this.selectedPost) return;
    if (this.rootCommentBoxes.length === 0) return;

    if (this.rootCommentIndex > 0) {
      this.rootCommentIndex--;
      this.scrollToRootComment(this.rootCommentIndex);
    }
  }

  private scrollToRootComment(index: number) {
    if (index < 0 || index >= this.rootCommentBoxes.length) return;

    const targetComment = this.rootCommentBoxes[index];
    if (!targetComment) return;

    // The comment box's y property is its absolute screen position.
    // To get its position within the scroll content, subtract the scroll content's y position.
    const scrollContent = this.detailScroll.content;
    const relativeY = targetComment.y - scrollContent.y;

    // Scroll so the comment is near the top of the viewport
    this.detailScroll.scrollTop = Math.max(0, relativeY - 1);
  }

  private openStoryUrl() {
    if (!this.selectedPost) return;
    const url =
      this.selectedPost.url ||
      `https://news.ycombinator.com/item?id=${this.selectedPost.id}`;
    this.callbacks.onOpenUrl?.(url);
  }

  private openOnHN() {
    if (!this.selectedPost) return;
    const url = `${HN_BASE_URL}/${this.selectedPost.id}`;
    this.callbacks.onOpenUrl?.(url);
  }

  private openChat() {
    if (!this.selectedPost) return;

    // Check if we have a configured provider with API key
    const provider = getConfiguredProvider();
    if (provider) {
      this.chatProvider = provider;
      this.showChatView();
    } else {
      // Show auth setup UI
      this.showAuthSetup();
    }
  }

  private showAuthSetup() {
    this.authSetupMode = true;
    this.authSetupStep = "provider";
    this.authSelectedProvider = "anthropic";

    // Remove detail view components
    this.detailPanel.remove(this.detailHeader.id);
    this.detailPanel.remove(this.detailScroll.id);
    this.detailPanel.remove(this.shortcutsBar.id);

    this.renderAuthSetup();
  }

  private hideAuthSetup() {
    this.authSetupMode = false;

    // Remove auth setup components
    for (const child of this.detailPanel.getChildren()) {
      this.detailPanel.remove(child.id);
    }

    // Re-add detail view components
    this.detailPanel.add(this.detailHeader);
    this.detailPanel.add(this.detailScroll);
    this.detailPanel.add(this.shortcutsBar);

    // Re-render the current story if we have one
    if (this.selectedPost) {
      this.renderDetail(this.selectedPost);
    }
  }

  private renderAuthSetup() {
    // Clear existing auth UI
    for (const child of this.detailPanel.getChildren()) {
      this.detailPanel.remove(child.id);
    }

    const container = new BoxRenderable(this.ctx, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 2,
      backgroundColor: COLORS.bg,
    });

    // Header
    const header = new TextRenderable(this.ctx, {
      content: "Set up AI Chat",
      fg: COLORS.accent,
    });
    container.add(header);

    // Spacer
    container.add(new BoxRenderable(this.ctx, { height: 1 }));

    if (this.authSetupStep === "provider") {
      // Provider selection
      const prompt = new TextRenderable(this.ctx, {
        content: "Choose your AI provider:",
        fg: COLORS.text,
      });
      container.add(prompt);

      container.add(new BoxRenderable(this.ctx, { height: 1 }));

      // Anthropic option
      const anthropicBox = new BoxRenderable(this.ctx, {
        flexDirection: "row",
        gap: 1,
      });
      const anthropicDot = new TextRenderable(this.ctx, {
        content: this.authSelectedProvider === "anthropic" ? "●" : "○",
        fg:
          this.authSelectedProvider === "anthropic"
            ? COLORS.accent
            : COLORS.textDim,
      });
      const anthropicLabel = new TextRenderable(this.ctx, {
        content: "Anthropic",
        fg:
          this.authSelectedProvider === "anthropic"
            ? COLORS.accent
            : COLORS.text,
      });
      anthropicBox.add(anthropicDot);
      anthropicBox.add(anthropicLabel);
      container.add(anthropicBox);

      // OpenAI option
      const openaiBox = new BoxRenderable(this.ctx, {
        flexDirection: "row",
        gap: 1,
      });
      const openaiDot = new TextRenderable(this.ctx, {
        content: this.authSelectedProvider === "openai" ? "●" : "○",
        fg:
          this.authSelectedProvider === "openai"
            ? COLORS.accent
            : COLORS.textDim,
      });
      const openaiLabel = new TextRenderable(this.ctx, {
        content: "OpenAI",
        fg:
          this.authSelectedProvider === "openai" ? COLORS.accent : COLORS.text,
      });
      openaiBox.add(openaiDot);
      openaiBox.add(openaiLabel);
      container.add(openaiBox);

      container.add(new BoxRenderable(this.ctx, { height: 2 }));

      // Instructions
      const instructions = new TextRenderable(this.ctx, {
        content: "↑/↓ to select, Enter to continue, Esc to cancel",
        fg: COLORS.textDim,
      });
      container.add(instructions);
    } else if (this.authSetupStep === "key") {
      // API key input
      const providerName =
        this.authSelectedProvider === "anthropic" ? "Anthropic" : "OpenAI";
      const prompt = new TextRenderable(this.ctx, {
        content: `Enter your ${providerName} API key:`,
        fg: COLORS.text,
      });
      container.add(prompt);

      container.add(new BoxRenderable(this.ctx, { height: 1 }));

      // Input field
      const inputContainer = new BoxRenderable(this.ctx, {
        width: "100%",
        flexDirection: "row",
        gap: 1,
      });

      const inputPrompt = new TextRenderable(this.ctx, {
        content: "›",
        fg: COLORS.accent,
      });
      inputContainer.add(inputPrompt);

      this.authKeyInput = new InputRenderable(this.ctx, {
        width: "100%",
        flexGrow: 1,
        placeholder:
          this.authSelectedProvider === "anthropic" ? "sk-ant-..." : "sk-...",
        backgroundColor: COLORS.bg,
      });

      this.authKeyInput.on("enter", () => {
        this.saveApiKey();
      });

      inputContainer.add(this.authKeyInput);
      container.add(inputContainer);

      container.add(new BoxRenderable(this.ctx, { height: 2 }));

      // Security note
      const securityNote = new TextRenderable(this.ctx, {
        content: "Your key is stored locally at ~/.config/hn-cli/config.json",
        fg: COLORS.textDim,
        wrapMode: "word",
      });
      container.add(securityNote);

      container.add(new BoxRenderable(this.ctx, { height: 1 }));

      const repoNote = new TextRenderable(this.ctx, {
        content: "This app is open source: github.com/brianlovin/hn-cli",
        fg: COLORS.textDim,
        wrapMode: "word",
      });
      container.add(repoNote);

      container.add(new BoxRenderable(this.ctx, { height: 2 }));

      const instructions = new TextRenderable(this.ctx, {
        content: "Enter to save, Esc to cancel",
        fg: COLORS.textDim,
      });
      container.add(instructions);

      // Focus the input after a brief delay to avoid capturing the enter key
      setTimeout(() => {
        if (this.authKeyInput) {
          this.authKeyInput.focus();
          this.authKeyInput.value = "";
        }
      }, 50);
    }

    this.detailPanel.add(container);
  }

  private saveApiKey() {
    if (!this.authKeyInput) return;

    const apiKey = this.authKeyInput.value.trim();
    if (!apiKey) return;

    // Save to config
    const config = loadConfig();
    config.provider = this.authSelectedProvider;
    if (this.authSelectedProvider === "anthropic") {
      config.anthropicApiKey = apiKey;
    } else {
      config.openaiApiKey = apiKey;
    }
    saveConfig(config);

    // Hide auth setup and open chat
    this.hideAuthSetup();
    this.chatProvider = this.authSelectedProvider;
    this.showChatView();
  }

  // Settings methods
  private showSettings() {
    this.settingsMode = true;
    this.settingsSection = "main";
    this.settingsSelectedIndex = 0;

    // Remove chat components
    for (const child of this.detailPanel.getChildren()) {
      this.detailPanel.remove(child.id);
    }

    this.renderSettings();
  }

  private hideSettings() {
    this.settingsMode = false;

    // Remove settings components
    for (const child of this.detailPanel.getChildren()) {
      this.detailPanel.remove(child.id);
    }

    // Re-create and add chat panel
    this.createChatPanel();
    if (this.chatPanel) {
      for (const child of this.chatPanel.getChildren()) {
        this.detailPanel.add(child);
      }
    }

    // Re-focus chat input
    if (this.chatInput) {
      this.chatInput.focus();
      this.chatInput.clear();
    }

    // Re-render suggestions
    this.renderSuggestions();
  }

  private getSettingsItems(): {
    label: string;
    action: string;
    enabled: boolean;
  }[] {
    const hasAnthropic = !!getApiKey("anthropic");
    const hasOpenAI = !!getApiKey("openai");

    const items: { label: string; action: string; enabled: boolean }[] = [];

    // Provider selection
    items.push({
      label: `Provider: ${this.chatProvider === "anthropic" ? "Anthropic" : "OpenAI"}`,
      action: "switch_provider",
      enabled: hasAnthropic && hasOpenAI,
    });

    // Model selection for current provider
    const currentModel = getModel(this.chatProvider);
    const models =
      this.chatProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
    const modelName =
      models.find((m) => m.id === currentModel)?.name || currentModel;
    items.push({
      label: `Model: ${modelName}`,
      action: "change_model",
      enabled: true,
    });

    // Add API key
    if (!hasAnthropic) {
      items.push({
        label: "Add Anthropic API key",
        action: "add_anthropic",
        enabled: true,
      });
    }
    if (!hasOpenAI) {
      items.push({
        label: "Add OpenAI API key",
        action: "add_openai",
        enabled: true,
      });
    }

    // Clear tokens
    if (hasAnthropic || hasOpenAI) {
      items.push({
        label: "Clear all API keys",
        action: "clear_keys",
        enabled: true,
      });
    }

    return items;
  }

  private renderSettings() {
    // Clear existing
    for (const child of this.detailPanel.getChildren()) {
      this.detailPanel.remove(child.id);
    }

    const container = new BoxRenderable(this.ctx, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 2,
      backgroundColor: COLORS.bg,
    });

    // Header
    const header = new TextRenderable(this.ctx, {
      content: "Settings",
      fg: COLORS.accent,
    });
    container.add(header);

    container.add(new BoxRenderable(this.ctx, { height: 1 }));

    if (this.settingsSection === "main") {
      const items = this.getSettingsItems();

      items.forEach((item, index) => {
        const isSelected = index === this.settingsSelectedIndex;
        const itemBox = new BoxRenderable(this.ctx, {
          flexDirection: "row",
          gap: 1,
        });

        const indicator = new TextRenderable(this.ctx, {
          content: isSelected ? "›" : " ",
          fg: COLORS.accent,
        });
        itemBox.add(indicator);

        const label = new TextRenderable(this.ctx, {
          content: item.label,
          fg: isSelected
            ? COLORS.accent
            : item.enabled
              ? COLORS.text
              : COLORS.textDim,
        });
        itemBox.add(label);

        container.add(itemBox);
      });

      container.add(new BoxRenderable(this.ctx, { height: 2 }));

      const hint = new TextRenderable(this.ctx, {
        content: "↑/↓ navigate  Enter select  Esc back",
        fg: COLORS.textDim,
      });
      container.add(hint);
    } else if (this.settingsSection === "model") {
      const models =
        this.settingsModelProvider === "anthropic"
          ? ANTHROPIC_MODELS
          : OPENAI_MODELS;
      const currentModel = getModel(this.settingsModelProvider);

      const subtitle = new TextRenderable(this.ctx, {
        content: `Select ${this.settingsModelProvider === "anthropic" ? "Anthropic" : "OpenAI"} model:`,
        fg: COLORS.text,
      });
      container.add(subtitle);

      container.add(new BoxRenderable(this.ctx, { height: 1 }));

      models.forEach((model, index) => {
        const isSelected = index === this.settingsSelectedIndex;
        const isCurrent = model.id === currentModel;
        const itemBox = new BoxRenderable(this.ctx, {
          flexDirection: "row",
          gap: 1,
        });

        const indicator = new TextRenderable(this.ctx, {
          content: isSelected ? "›" : " ",
          fg: COLORS.accent,
        });
        itemBox.add(indicator);

        const dot = new TextRenderable(this.ctx, {
          content: isCurrent ? "●" : "○",
          fg: isCurrent ? COLORS.accent : COLORS.textDim,
        });
        itemBox.add(dot);

        const label = new TextRenderable(this.ctx, {
          content: model.name,
          fg: isSelected ? COLORS.accent : COLORS.text,
        });
        itemBox.add(label);

        container.add(itemBox);
      });

      container.add(new BoxRenderable(this.ctx, { height: 2 }));

      const hint = new TextRenderable(this.ctx, {
        content: "↑/↓ navigate  Enter select  Esc back",
        fg: COLORS.textDim,
      });
      container.add(hint);
    }

    this.detailPanel.add(container);
  }

  private navigateSettings(delta: number) {
    let maxIndex: number;

    if (this.settingsSection === "main") {
      maxIndex = this.getSettingsItems().length - 1;
    } else {
      const models =
        this.settingsModelProvider === "anthropic"
          ? ANTHROPIC_MODELS
          : OPENAI_MODELS;
      maxIndex = models.length - 1;
    }

    this.settingsSelectedIndex = Math.max(
      0,
      Math.min(maxIndex, this.settingsSelectedIndex + delta),
    );
    this.renderSettings();
  }

  private selectSettingsItem() {
    if (this.settingsSection === "main") {
      const items = this.getSettingsItems();
      const selected = items[this.settingsSelectedIndex];
      if (!selected || !selected.enabled) return;

      switch (selected.action) {
        case "switch_provider":
          this.chatProvider =
            this.chatProvider === "anthropic" ? "openai" : "anthropic";
          // Persist the provider preference
          const switchConfig = loadConfig();
          switchConfig.provider = this.chatProvider;
          saveConfig(switchConfig);
          // Reset the client so it uses the new provider
          this.anthropic = null;
          this.openai = null;
          this.renderSettings();
          break;

        case "change_model":
          this.settingsSection = "model";
          this.settingsModelProvider = this.chatProvider;
          this.settingsSelectedIndex = 0;
          this.renderSettings();
          break;

        case "add_anthropic":
          this.hideSettings();
          this.authSelectedProvider = "anthropic";
          this.authSetupStep = "key";
          this.authSetupMode = true;
          this.chatMode = false;
          this.renderAuthSetup();
          break;

        case "add_openai":
          this.hideSettings();
          this.authSelectedProvider = "openai";
          this.authSetupStep = "key";
          this.authSetupMode = true;
          this.chatMode = false;
          this.renderAuthSetup();
          break;

        case "clear_keys":
          clearAllApiKeys();
          this.anthropic = null;
          this.openai = null;
          this.hideSettings();
          this.hideChatView();
          break;
      }
    } else if (this.settingsSection === "model") {
      const models =
        this.settingsModelProvider === "anthropic"
          ? ANTHROPIC_MODELS
          : OPENAI_MODELS;
      const selected = models[this.settingsSelectedIndex];
      if (selected) {
        setModel(this.settingsModelProvider, selected.id);
        // Reset the client so it picks up the new model
        if (this.settingsModelProvider === "anthropic") {
          this.anthropic = null;
        } else {
          this.openai = null;
        }
        this.settingsSection = "main";
        this.settingsSelectedIndex = 1; // Back to model item
        this.renderSettings();
      }
    }
  }

  // Suggestion methods
  private navigateSuggestion(delta: number) {
    if (this.suggestions.length === 0) return;

    // Navigate within bounds (0 to length-1)
    // Up arrow (delta -1) moves towards top (lower index)
    // Down arrow (delta +1) moves towards bottom (higher index)
    const newIndex = this.selectedSuggestionIndex + delta;
    this.selectedSuggestionIndex = Math.max(
      0,
      Math.min(this.suggestions.length - 1, newIndex),
    );

    this.renderSuggestions();
  }

  private selectSuggestion() {
    if (
      this.selectedSuggestionIndex < 0 ||
      this.selectedSuggestionIndex >= this.suggestions.length
    )
      return;

    const suggestion = this.suggestions[this.selectedSuggestionIndex];
    if (!suggestion) return;

    if (this.chatInput) {
      this.chatInput.clear();
      this.chatInput.insertText(suggestion);
    }

    // Clear suggestions and send
    this.suggestions = [];
    this.selectedSuggestionIndex = -1;
    this.renderSuggestions();
    this.sendChatMessage();
  }

  private renderSuggestions() {
    if (!this.suggestionsContainer) return;

    // Clear existing content
    for (const child of this.suggestionsContainer.getChildren()) {
      this.suggestionsContainer.remove(child.id);
    }

    // Show loading state
    if (this.suggestionsLoading) {
      const loadingText = new TextRenderable(this.ctx, {
        id: "suggestions-loading",
        content: `${HackerNewsApp.LOADING_CHARS[this.loadingFrame] ?? "⠋"} Generating suggestions...`,
        fg: COLORS.textDim,
      });
      this.suggestionsContainer.add(loadingText);
      return;
    }

    // No suggestions to show
    if (this.suggestions.length === 0) return;

    // Render each suggestion in a BoxRenderable row (similar to story items)
    for (let index = 0; index < this.suggestions.length; index++) {
      const suggestion = this.suggestions[index];
      if (!suggestion) continue;

      const isSelected = index === this.selectedSuggestionIndex;

      // Row container - similar structure to story items
      const row = new BoxRenderable(this.ctx, {
        id: `suggestion-row-${index}`,
        width: "100%",
        flexDirection: "row",
        backgroundColor: COLORS.bg,
      });

      // Indicator
      const indicator = new TextRenderable(this.ctx, {
        id: `suggestion-indicator-${index}`,
        content: isSelected ? "› " : "  ",
        fg: COLORS.accent,
        width: 2,
      });
      row.add(indicator);

      // Suggestion text
      const text = new TextRenderable(this.ctx, {
        id: `suggestion-text-${index}`,
        content: suggestion,
        fg: isSelected ? COLORS.accent : COLORS.textDim,
      });
      row.add(text);

      this.suggestionsContainer.add(row);
    }
  }

  private async generateSuggestions() {
    if (!this.selectedPost || this.suggestionsGenerated) return;

    log("[suggestions] Starting generation...");
    log("[suggestions] Provider:", this.chatProvider);

    this.suggestionsGenerated = true;
    this.suggestionsLoading = true;

    // Start loading animation for suggestions
    const suggestionsLoadingInterval = setInterval(() => {
      if (!this.renderer.isDestroyed && this.suggestionsLoading) {
        this.loadingFrame =
          (this.loadingFrame + 1) % HackerNewsApp.LOADING_CHARS.length;
        this.renderSuggestions();
      }
    }, 80);

    // Build context for generating suggestions
    const post = this.selectedPost;
    const commentsPreview =
      post.comments
        ?.slice(0, 3)
        .map(
          (c) =>
            `${c.user}: ${this.stripHtml(c.content || "").slice(0, 100)}...`,
        )
        .join("\n") || "No comments yet";

    const prompt = `Based on this Hacker News story, generate 3 short questions (max 10 words each) a reader might want to ask. Return ONLY the 3 questions, one per line, no numbering or bullets.

Title: ${post.title}
Domain: ${post.domain || "N/A"}
Comments preview:
${commentsPreview}`;

    try {
      let questions: string[] = [];

      if (this.chatProvider === "anthropic") {
        log("[suggestions] Using Anthropic API");
        if (!this.anthropic) {
          const apiKey = getApiKey("anthropic");
          log("[suggestions] API key exists:", !!apiKey);
          this.anthropic = new Anthropic({ apiKey });
        }

        const model = getModel("anthropic") as string;
        log("[suggestions] Model:", model);

        const response = await this.anthropic.messages.create({
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
        if (!this.openai) {
          const apiKey = getApiKey("openai");
          log("[suggestions] API key exists:", !!apiKey);
          log("[suggestions] API key prefix:", apiKey?.slice(0, 10) + "...");
          this.openai = new OpenAI({ apiKey });
        }

        const model = getModel("openai") as string;
        log("[suggestions] Model:", model);

        log("[suggestions] Making OpenAI request...");
        const response = await this.openai.chat.completions.create({
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

      // Stop loading
      clearInterval(suggestionsLoadingInterval);
      this.suggestionsLoading = false;

      if (questions.length > 0) {
        this.suggestions = questions;
        this.originalSuggestions = [...questions]; // Save for restoring later
        // Select the last suggestion (bottom one, closest to input)
        this.selectedSuggestionIndex = questions.length - 1;
      }
      // Always render to clear loading state
      this.renderSuggestions();
    } catch (error) {
      // Stop loading on error
      clearInterval(suggestionsLoadingInterval);
      this.suggestionsLoading = false;
      this.renderSuggestions();

      log("[ERROR]", "[suggestions] Error generating suggestions:");
      log("[ERROR]", "[suggestions] Error type:", error?.constructor?.name);
      log(
        "[ERROR]",
        "[suggestions] Error message:",
        error instanceof Error ? error.message : String(error),
      );
      if (error instanceof Error && error.stack) {
        log("[ERROR]", "[suggestions] Stack trace:", error.stack);
      }
      // Log full error object for debugging
      try {
        log(
          "[ERROR]",
          "[suggestions] Full error:",
          JSON.stringify(error, null, 2),
        );
      } catch {
        log("[ERROR]", "[suggestions] Full error (non-JSON):", error);
      }
    }
  }

  private async refresh() {
    await this.loadPosts();
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  private stripHtml(html: string): string {
    return (
      html
        // Handle paragraphs - add double newline between them
        .replace(/<\/p>\s*<p>/g, "\n\n")
        .replace(/<p>/g, "")
        .replace(/<\/p>/g, "\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g, "$2 ($1)")
        .replace(/<code>/g, "`")
        .replace(/<\/code>/g, "`")
        .replace(/<pre>/g, "\n```\n")
        .replace(/<\/pre>/g, "\n```\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, "/")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        // Normalize multiple newlines to max 2
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    );
  }

  // Public getters for testing
  get currentSelectedIndex(): number {
    return this.selectedIndex;
  }

  get currentRootCommentIndex(): number {
    return this.rootCommentIndex;
  }

  get currentPosts(): HackerNewsPost[] {
    return this.posts;
  }

  get currentSelectedPost(): HackerNewsPost | null {
    return this.selectedPost;
  }

  get rootCommentCount(): number {
    return this.rootCommentBoxes.length;
  }

  // For testing: allow setting posts directly
  setPostsForTesting(posts: HackerNewsPost[]) {
    this.posts = posts;
    this.renderStoryList();
  }

  // For testing: allow setting selected post directly
  async setSelectedPostForTesting(post: HackerNewsPost) {
    this.selectedPost = post;
    this.renderDetail(post);
  }
}
