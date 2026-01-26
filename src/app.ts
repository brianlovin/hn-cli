import { BoxRenderable, type CliRenderer, type RenderContext } from "@opentui/core";
import { log } from "./logger";
import { getRankedPosts, getPostById } from "./api";
import type { HackerNewsPost } from "./types";
import {
  type Provider,
  getConfiguredProvider,
  setModel,
  saveConfig,
  loadConfig,
  clearAllApiKeys,
} from "./config";
import { type UpdateInfo } from "./version";
import { COLORS, detectTheme } from "./theme";
import { LOADING_CHARS } from "./utils";

// Import components
import {
  createHeader,
  startLoadingAnimation,
  stopLoadingAnimation,
  type HeaderState,
} from "./components/Header";
import {
  createStoryList,
  renderStoryList,
  updateStorySelection,
  scrollToStory,
  type StoryListState,
} from "./components/StoryList";
import {
  createStoryDetail,
  renderStoryDetail,
  renderEmptyDetail,
  scrollToRootComment,
  type StoryDetailState,
} from "./components/StoryDetail";
import {
  createChatPanel,
  renderChatMessages,
  scrollChatToBottom,
  addChatMessage,
  startTypingIndicator,
  stopTypingIndicator,
  type ChatPanelState,
} from "./components/ChatPanel";
import { renderSuggestions, navigateSuggestion } from "./components/Suggestions";
import {
  renderAuthSetup,
  initAuthSetupState,
  navigateAuthProvider,
  confirmAuthProvider,
  type AuthSetupState,
} from "./components/AuthSetup";
import {
  renderSettings,
  initSettingsState,
  navigateSettings,
  selectSettingsItem,
  goBackInSettings,
  type SettingsState,
} from "./components/SettingsPanel";

// Import services
import {
  initChatServiceState,
  streamAIResponse,
  generateSuggestions,
  generateFollowUpQuestions,
  resetChatServiceClients,
  setProvider,
  type ChatServiceState,
} from "./services/ChatService";

const MAX_FOLLOW_UP_ROUNDS = 3;

// Saved chat session state for preserving chats per story
interface SavedChatSession {
  messages: { role: "user" | "assistant"; content: string }[];
  suggestions: string[];
  originalSuggestions: string[];
  followUpCount: number;
}

export interface AppCallbacks {
  onOpenUrl?: (url: string) => void;
  onExit?: () => void;
}

export class HackerNewsApp {
  private renderer: CliRenderer;
  private ctx: RenderContext;
  private callbacks: AppCallbacks;

  // Data state
  private posts: HackerNewsPost[] = [];
  private selectedIndex = -1;
  private selectedPost: HackerNewsPost | null = null;
  private rootCommentIndex = 0;

  // Layout containers
  private contentArea!: BoxRenderable;

  // Component states
  private headerState!: HeaderState;
  private storyListState!: StoryListState;
  private storyDetailState!: StoryDetailState;
  private chatPanelState: ChatPanelState | null = null;
  private authSetupState: AuthSetupState | null = null;
  private settingsState: SettingsState | null = null;
  private chatServiceState: ChatServiceState | null = null;

  // Saved chat sessions per story (keyed by story ID)
  private savedChatSessions: Map<number, SavedChatSession> = new Map();

  // UI mode flags
  private chatMode = false;
  private authSetupMode = false;
  private settingsMode = false;

  // Update notification state
  private updateInfo: UpdateInfo | null = null;

  // Follow-up questions state
  private followUpCount = 0;
  private isGeneratingFollowUps = false;

  constructor(renderer: CliRenderer, callbacks: AppCallbacks = {}) {
    this.renderer = renderer;
    this.ctx = renderer;
    this.callbacks = callbacks;
  }

  async initialize() {
    await detectTheme(this.renderer);
    this.setupLayout();
    this.setupKeyboardHandlers();
    await this.loadPosts();
  }

  initializeForTesting() {
    this.setupLayout();
    this.setupKeyboardHandlers();
  }

  setUpdateInfo(info: UpdateInfo) {
    this.updateInfo = info;
    if (this.selectedIndex === -1 && !this.chatMode && !this.authSetupMode && !this.settingsMode) {
      renderEmptyDetail(this.ctx, this.storyDetailState, this.updateInfo);
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

    // Create header
    const { header, state: headerState } = createHeader(this.ctx, {
      onOpenGitHub: () => {
        this.callbacks.onOpenUrl?.("https://github.com/brianlovin/hn-cli");
      },
    });
    this.headerState = headerState;

    // Create content area
    this.contentArea = new BoxRenderable(this.ctx, {
      id: "content-area",
      width: "100%",
      flexGrow: 1,
      flexDirection: "row",
    });

    // Create story list
    this.storyListState = createStoryList(this.ctx);

    // Create story detail
    this.storyDetailState = createStoryDetail(this.ctx, {
      onOpenStoryUrl: () => this.openStoryUrl(),
    });

    this.contentArea.add(this.storyListState.panel);
    this.contentArea.add(this.storyDetailState.panel);

    mainContainer.add(header);
    mainContainer.add(this.contentArea);

    this.renderer.root.add(mainContainer);
  }

  private setupKeyboardHandlers() {
    this.renderer.keyInput.on("keypress", (key) => {
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        this.callbacks.onExit?.();
        return;
      }

      // Settings mode handlers
      if (this.settingsMode && this.settingsState) {
        this.handleSettingsKey(key);
        return;
      }

      // Auth setup mode handlers
      if (this.authSetupMode && this.authSetupState) {
        this.handleAuthSetupKey(key);
        return;
      }

      // Chat mode handlers
      if (this.chatMode && this.chatPanelState) {
        this.handleChatKey(key);
        return;
      }

      // Main view handlers
      this.handleMainKey(key);
    });
  }

  private handleSettingsKey(key: any) {
    if (!this.settingsState) return;

    if (key.name === "escape") {
      if (!goBackInSettings(this.settingsState)) {
        this.hideSettings();
      } else {
        this.rerenderSettings();
      }
      return;
    }

    if (key.name === "j" || key.name === "down") {
      navigateSettings(this.settingsState, 1, this.chatServiceState?.provider || "anthropic");
      this.rerenderSettings();
    } else if (key.name === "k" || key.name === "up") {
      navigateSettings(this.settingsState, -1, this.chatServiceState?.provider || "anthropic");
      this.rerenderSettings();
    } else if (key.name === "return" || key.name === "enter") {
      const action = selectSettingsItem(
        this.settingsState,
        this.chatServiceState?.provider || "anthropic",
      );
      if (action) {
        this.handleSettingsAction(action);
      }
    }
  }

  private handleSettingsAction(action: any) {
    if (!this.chatServiceState) return;

    switch (action.type) {
      case "switch_provider":
        const newProvider: Provider =
          this.chatServiceState.provider === "anthropic" ? "openai" : "anthropic";
        setProvider(this.chatServiceState, newProvider);
        const switchConfig = loadConfig();
        switchConfig.provider = newProvider;
        saveConfig(switchConfig);
        resetChatServiceClients(this.chatServiceState);
        this.rerenderSettings();
        break;

      case "change_model":
        this.rerenderSettings();
        break;

      case "add_anthropic":
        this.hideSettings();
        this.authSetupState = initAuthSetupState();
        this.authSetupState.selectedProvider = "anthropic";
        this.authSetupState.step = "key";
        this.authSetupMode = true;
        this.chatMode = false;
        this.showAuthSetupUI();
        break;

      case "add_openai":
        this.hideSettings();
        this.authSetupState = initAuthSetupState();
        this.authSetupState.selectedProvider = "openai";
        this.authSetupState.step = "key";
        this.authSetupMode = true;
        this.chatMode = false;
        this.showAuthSetupUI();
        break;

      case "clear_keys":
        clearAllApiKeys();
        resetChatServiceClients(this.chatServiceState);
        this.hideSettings();
        this.hideChatView();
        break;

      case "select_model":
        setModel(action.provider, action.modelId);
        resetChatServiceClients(this.chatServiceState);
        this.rerenderSettings();
        break;
    }
  }

  private handleAuthSetupKey(key: any) {
    if (!this.authSetupState) return;

    if (key.name === "escape") {
      this.hideAuthSetup();
      return;
    }

    if (this.authSetupState.step === "provider") {
      if (key.name === "j" || key.name === "down") {
        navigateAuthProvider(this.authSetupState, 1);
        this.showAuthSetupUI();
      } else if (key.name === "k" || key.name === "up") {
        navigateAuthProvider(this.authSetupState, -1);
        this.showAuthSetupUI();
      } else if (key.name === "return" || key.name === "enter") {
        confirmAuthProvider(this.authSetupState);
        this.showAuthSetupUI();
      }
    }
  }

  private handleChatKey(key: any) {
    if (!this.chatPanelState) return;

    if (key.name === "escape") {
      this.hideChatView();
      return;
    }

    if (key.name === "." && key.super) {
      this.showSettings();
      return;
    }

    const suggestionsState = this.chatPanelState.suggestions;

    // Suggestion navigation when input is empty
    if (
      suggestionsState.suggestions.length > 0 &&
      this.chatPanelState.input &&
      !this.chatPanelState.input.plainText.trim()
    ) {
      if (key.name === "up" || key.name === "k") {
        navigateSuggestion(suggestionsState, -1);
        renderSuggestions(this.ctx, suggestionsState);
        return;
      } else if (key.name === "down" || key.name === "j") {
        navigateSuggestion(suggestionsState, 1);
        renderSuggestions(this.ctx, suggestionsState);
        return;
      }
    }

    // Handle Tab key to insert suggestion into input for editing
    if (
      key.name === "tab" &&
      suggestionsState.selectedIndex >= 0 &&
      suggestionsState.suggestions.length > 0
    ) {
      const suggestion = suggestionsState.suggestions[suggestionsState.selectedIndex];
      if (suggestion && this.chatPanelState.input) {
        this.chatPanelState.input.clear();
        this.chatPanelState.input.insertText(suggestion + " ");
        // Clear suggestions so user can type freely
        suggestionsState.suggestions = [];
        suggestionsState.selectedIndex = -1;
        renderSuggestions(this.ctx, suggestionsState);
        return;
      }
    }

    // Handle Enter key for chat submission
    if ((key.name === "return" || key.name === "enter") && !key.shift) {
      if (this.chatPanelState.input && this.chatPanelState.input.plainText.trim()) {
        this.sendChatMessage();
        return;
      }
      if (suggestionsState.selectedIndex >= 0 && suggestionsState.suggestions.length > 0) {
        this.selectSuggestion();
        return;
      }
      return;
    }

    // Clear suggestions when user starts typing
    if (
      suggestionsState.suggestions.length > 0 &&
      key.sequence &&
      key.sequence.length === 1 &&
      !key.ctrl &&
      !key.meta
    ) {
      const charCode = key.sequence.charCodeAt(0);
      if (charCode >= 32 && charCode <= 126) {
        suggestionsState.suggestions = [];
        suggestionsState.selectedIndex = -1;
        renderSuggestions(this.ctx, suggestionsState);
      }
    }

    // Restore suggestions when backspace clears the input
    if (
      key.name === "backspace" &&
      this.chatPanelState.input &&
      suggestionsState.originalSuggestions.length > 0
    ) {
      setTimeout(() => {
        if (
          this.chatPanelState?.input &&
          !this.chatPanelState.input.plainText.trim() &&
          this.chatPanelState.suggestions.suggestions.length === 0
        ) {
          this.chatPanelState.suggestions.suggestions = [...this.chatPanelState.suggestions.originalSuggestions];
          this.chatPanelState.suggestions.selectedIndex = this.chatPanelState.suggestions.suggestions.length - 1;
          renderSuggestions(this.ctx, this.chatPanelState.suggestions);
        }
      }, 10);
    }
  }

  private handleMainKey(key: any) {
    const hasCmdMod = key.super;

    if (key.name === "j" && !hasCmdMod) {
      this.navigateStory(1);
    } else if (key.name === "k" && !hasCmdMod) {
      this.navigateStory(-1);
    } else if (key.name === "j" && hasCmdMod) {
      this.navigateToNextComment();
    } else if (key.name === "k" && hasCmdMod) {
      this.navigateToPreviousComment();
    } else if (key.name === "o") {
      this.openStoryUrl();
    } else if (key.name === "c") {
      this.openChat();
    } else if (key.name === "r") {
      this.refresh();
    }
  }

  private async loadPosts() {
    startLoadingAnimation(this.headerState, () => this.renderer.isDestroyed);
    try {
      this.posts = await getRankedPosts();
      stopLoadingAnimation(this.headerState);
      renderStoryList(this.ctx, this.storyListState, this.posts, this.selectedIndex, {
        onSelect: (index) => this.selectStory(index),
      });
      renderEmptyDetail(this.ctx, this.storyDetailState, this.updateInfo);
    } catch (error) {
      stopLoadingAnimation(this.headerState);
      log("[ERROR]", "Error loading posts:", error);
    }
  }

  async selectStory(index: number) {
    if (index < 0 || index >= this.posts.length) return;
    if (this.renderer.isDestroyed) return;

    const previousIndex = this.selectedIndex;
    this.selectedIndex = index;
    this.rootCommentIndex = 0;

    updateStorySelection(this.storyListState, this.posts, previousIndex, index);

    const post = this.posts[index];
    if (!post) return;

    try {
      const fullPost = await getPostById(post.id);
      if (this.renderer.isDestroyed) return;
      if (fullPost) {
        this.selectedPost = fullPost;
        renderStoryDetail(this.ctx, this.storyDetailState, fullPost, {
          onOpenStoryUrl: () => this.openStoryUrl(),
        });
      }
    } catch (error) {
      log("[ERROR]", "Error loading post:", error);
    }

    if (this.renderer.isDestroyed) return;
    scrollToStory(this.storyListState, index);
  }

  private navigateStory(delta: number) {
    if (this.posts.length === 0) return;

    if (this.selectedIndex === -1) {
      if (delta > 0) {
        this.selectStory(0);
      } else {
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
    if (this.storyDetailState.rootCommentBoxes.length === 0) return;

    const maxIndex = this.storyDetailState.rootCommentBoxes.length - 1;
    if (this.rootCommentIndex < maxIndex) {
      this.rootCommentIndex++;
      scrollToRootComment(this.storyDetailState, this.rootCommentIndex);
    }
  }

  private navigateToPreviousComment() {
    if (!this.selectedPost) return;
    if (this.storyDetailState.rootCommentBoxes.length === 0) return;

    if (this.rootCommentIndex > 0) {
      this.rootCommentIndex--;
      scrollToRootComment(this.storyDetailState, this.rootCommentIndex);
    }
  }

  private openStoryUrl() {
    if (!this.selectedPost) return;
    const url =
      this.selectedPost.url ||
      `https://news.ycombinator.com/item?id=${this.selectedPost.id}`;
    this.callbacks.onOpenUrl?.(url);
  }

  private openChat() {
    if (!this.selectedPost) return;

    const provider = getConfiguredProvider();
    if (provider) {
      this.chatServiceState = initChatServiceState(provider);
      this.showChatView();
    } else {
      this.showAuthSetup();
    }
  }

  private showChatView() {
    if (!this.selectedPost || !this.chatServiceState) return;

    this.chatMode = true;

    // Hide story list and expand detail panel
    this.contentArea.remove(this.storyListState.panel.id);
    (this.storyDetailState.panel as any).width = "100%";

    // Remove detail view components
    this.storyDetailState.panel.remove(this.storyDetailState.header.id);
    this.storyDetailState.panel.remove(this.storyDetailState.scroll.id);
    this.storyDetailState.panel.remove(this.storyDetailState.shortcutsBar.id);

    // Create and add chat panel
    this.chatPanelState = createChatPanel(this.ctx, this.selectedPost, {
      onOpenStoryUrl: () => this.openStoryUrl(),
      onSubmit: () => this.sendChatMessage(),
    });

    // Add chat panel children directly to detail panel
    for (const child of this.chatPanelState.panel.getChildren()) {
      this.storyDetailState.panel.add(child);
    }

    // Focus the input
    setTimeout(() => {
      if (this.chatPanelState?.input) {
        this.chatPanelState.input.focus();
        this.chatPanelState.input.clear();
      }
    }, 10);

    // Check if there's a saved session for this story
    const savedSession = this.savedChatSessions.get(this.selectedPost.id);

    if (savedSession) {
      // Restore the saved session
      this.followUpCount = savedSession.followUpCount;
      this.chatPanelState.messages = [...savedSession.messages];
      this.chatPanelState.suggestions.suggestions = [...savedSession.suggestions];
      this.chatPanelState.suggestions.originalSuggestions = [...savedSession.originalSuggestions];
      this.chatPanelState.suggestions.selectedIndex = savedSession.suggestions.length > 0
        ? savedSession.suggestions.length - 1
        : -1;

      // Re-render restored messages and suggestions
      renderChatMessages(this.ctx, this.chatPanelState, this.chatServiceState.provider);
      renderSuggestions(this.ctx, this.chatPanelState.suggestions);
    } else {
      // Fresh session - add initial assistant message
      this.followUpCount = 0;
      addChatMessage(
        this.ctx,
        this.chatPanelState,
        "assistant",
        `I have the full context of "${this.selectedPost.title}" and all ${this.selectedPost.comments_count} comments. Ask me anything!`,
        this.chatServiceState.provider,
      );

      // Show loading state and generate dynamic suggestions
      this.chatPanelState.suggestions.loading = true;
      renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      this.generateInitialSuggestions();
    }
  }

  private hideChatView() {
    if (!this.chatMode) return;

    this.chatMode = false;

    // Save the chat session for this story before clearing
    if (this.selectedPost && this.chatPanelState) {
      this.savedChatSessions.set(this.selectedPost.id, {
        messages: [...this.chatPanelState.messages],
        suggestions: [...this.chatPanelState.suggestions.suggestions],
        originalSuggestions: [...this.chatPanelState.suggestions.originalSuggestions],
        followUpCount: this.followUpCount,
      });
    }

    // Blur the chat input
    if (this.chatPanelState?.input) {
      this.chatPanelState.input.blur();
    }

    // Show story list and restore detail panel width
    this.contentArea.remove(this.storyDetailState.panel.id);
    this.contentArea.add(this.storyListState.panel);
    this.contentArea.add(this.storyDetailState.panel);
    (this.storyDetailState.panel as any).width = "65%";

    // Remove chat components
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    // Re-add detail view components
    this.storyDetailState.panel.add(this.storyDetailState.header);
    this.storyDetailState.panel.add(this.storyDetailState.scroll);
    this.storyDetailState.panel.add(this.storyDetailState.shortcutsBar);

    // Re-render the current story
    if (this.selectedPost) {
      renderStoryDetail(this.ctx, this.storyDetailState, this.selectedPost, {
        onOpenStoryUrl: () => this.openStoryUrl(),
      });
    }

    // Mark panel as inactive before nullifying to prevent stale setTimeout callbacks
    if (this.chatPanelState) {
      this.chatPanelState.isActive = false;
    }
    this.chatPanelState = null;
  }

  private async sendChatMessage() {
    if (!this.chatPanelState || !this.chatServiceState || this.chatServiceState.isStreaming) return;

    const userMessage = this.chatPanelState.input.plainText.trim();
    if (!userMessage) return;

    // Clear input and suggestions
    this.chatPanelState.input.clear();
    this.chatPanelState.suggestions.suggestions = [];
    this.chatPanelState.suggestions.originalSuggestions = [];
    this.chatPanelState.suggestions.selectedIndex = -1;
    renderSuggestions(this.ctx, this.chatPanelState.suggestions);

    // Add user message
    addChatMessage(this.ctx, this.chatPanelState, "user", userMessage, this.chatServiceState.provider);

    // Add placeholder for streaming response
    const assistantMsgIndex = this.chatPanelState.messages.length;
    addChatMessage(this.ctx, this.chatPanelState, "assistant", "...", this.chatServiceState.provider);

    if (!this.selectedPost) return;

    // Start typing indicator animation
    startTypingIndicator(this.ctx, this.chatPanelState, this.chatServiceState.provider);

    let receivedFirstText = false;

    await streamAIResponse(
      this.chatServiceState,
      this.chatPanelState.messages,
      userMessage,
      this.selectedPost,
      {
        onText: (text) => {
          // Stop typing indicator on first text
          if (!receivedFirstText && this.chatPanelState) {
            receivedFirstText = true;
            stopTypingIndicator(this.chatPanelState);
          }
          if (this.chatPanelState?.messages[assistantMsgIndex]) {
            this.chatPanelState.messages[assistantMsgIndex].content = text;
            renderChatMessages(this.ctx, this.chatPanelState, this.chatServiceState!.provider);
          }
        },
        onComplete: () => {
          if (this.chatPanelState) {
            stopTypingIndicator(this.chatPanelState);
          }
          this.generateFollowUpQuestionsIfNeeded();
        },
        onError: (error) => {
          if (this.chatPanelState) {
            stopTypingIndicator(this.chatPanelState);
          }
          const providerName =
            this.chatServiceState?.provider === "anthropic" ? "Anthropic" : "OpenAI";
          if (this.chatPanelState?.messages[assistantMsgIndex]) {
            this.chatPanelState.messages[assistantMsgIndex].content =
              `Error: ${error.message}\n\nCheck your ${providerName} API key in ~/.config/hn-cli/config.json`;
            renderChatMessages(this.ctx, this.chatPanelState, this.chatServiceState!.provider);
          }
        },
      },
    );
  }

  private selectSuggestion() {
    if (!this.chatPanelState) return;

    const suggestionsState = this.chatPanelState.suggestions;
    if (
      suggestionsState.selectedIndex < 0 ||
      suggestionsState.selectedIndex >= suggestionsState.suggestions.length
    )
      return;

    const suggestion = suggestionsState.suggestions[suggestionsState.selectedIndex];
    if (!suggestion) return;

    if (this.chatPanelState.input) {
      this.chatPanelState.input.clear();
      this.chatPanelState.input.insertText(suggestion);
    }

    // Clear suggestions and send
    suggestionsState.suggestions = [];
    suggestionsState.selectedIndex = -1;
    renderSuggestions(this.ctx, suggestionsState);
    this.sendChatMessage();
  }

  private async generateInitialSuggestions() {
    if (!this.selectedPost || !this.chatPanelState || !this.chatServiceState) return;

    const suggestionsState = this.chatPanelState.suggestions;

    // Start loading animation
    const loadingInterval = setInterval(() => {
      if (!this.renderer.isDestroyed && suggestionsState.loading) {
        suggestionsState.loadingFrame =
          (suggestionsState.loadingFrame + 1) % LOADING_CHARS.length;
        renderSuggestions(this.ctx, suggestionsState);
      }
    }, 80);

    try {
      const questions = await generateSuggestions(this.chatServiceState, this.selectedPost);

      clearInterval(loadingInterval);
      suggestionsState.loading = false;

      if (questions.length > 0) {
        suggestionsState.suggestions = questions;
        suggestionsState.originalSuggestions = [...questions];
        suggestionsState.selectedIndex = questions.length - 1;
      }
      renderSuggestions(this.ctx, suggestionsState);
    } catch (error) {
      clearInterval(loadingInterval);
      suggestionsState.loading = false;
      renderSuggestions(this.ctx, suggestionsState);
      log("[ERROR]", "[suggestions] Error:", error);
    }
  }

  private async generateFollowUpQuestionsIfNeeded() {
    if (this.followUpCount >= MAX_FOLLOW_UP_ROUNDS) return;
    if (this.isGeneratingFollowUps) return;
    if (!this.chatPanelState || !this.chatServiceState || !this.selectedPost) return;

    const hasAssistantMessage = this.chatPanelState.messages.some((m) => m.role === "assistant");
    if (!hasAssistantMessage) return;

    this.isGeneratingFollowUps = true;
    const suggestionsState = this.chatPanelState.suggestions;
    suggestionsState.loading = true;
    renderSuggestions(this.ctx, suggestionsState);

    const loadingInterval = setInterval(() => {
      if (!this.renderer.isDestroyed && suggestionsState.loading) {
        suggestionsState.loadingFrame =
          (suggestionsState.loadingFrame + 1) % LOADING_CHARS.length;
        renderSuggestions(this.ctx, suggestionsState);
      }
    }, 80);

    try {
      const questions = await generateFollowUpQuestions(
        this.chatServiceState,
        this.selectedPost,
        this.chatPanelState.messages,
      );

      clearInterval(loadingInterval);
      suggestionsState.loading = false;

      if (questions.length > 0) {
        suggestionsState.suggestions = questions;
        suggestionsState.originalSuggestions = [...questions];
        suggestionsState.selectedIndex = questions.length - 1;
        this.followUpCount++;
      }

      renderSuggestions(this.ctx, suggestionsState);
      scrollChatToBottom(this.chatPanelState);
    } catch (error) {
      clearInterval(loadingInterval);
      suggestionsState.loading = false;
      renderSuggestions(this.ctx, suggestionsState);
      log("[ERROR]", "[follow-up] Error:", error);
    } finally {
      this.isGeneratingFollowUps = false;
    }
  }

  private showAuthSetup() {
    this.authSetupMode = true;
    this.authSetupState = initAuthSetupState();

    // Remove detail view components
    this.storyDetailState.panel.remove(this.storyDetailState.header.id);
    this.storyDetailState.panel.remove(this.storyDetailState.scroll.id);
    this.storyDetailState.panel.remove(this.storyDetailState.shortcutsBar.id);

    this.showAuthSetupUI();
  }

  private showAuthSetupUI() {
    if (!this.authSetupState) return;

    // Clear existing content
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    const authUI = renderAuthSetup(this.ctx, this.authSetupState, {
      onSaveKey: (provider, key) => this.saveApiKey(provider, key),
    });
    this.storyDetailState.panel.add(authUI);
  }

  private hideAuthSetup() {
    this.authSetupMode = false;

    // Remove auth setup components
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    // Re-add detail view components
    this.storyDetailState.panel.add(this.storyDetailState.header);
    this.storyDetailState.panel.add(this.storyDetailState.scroll);
    this.storyDetailState.panel.add(this.storyDetailState.shortcutsBar);

    // Re-render the current story
    if (this.selectedPost) {
      renderStoryDetail(this.ctx, this.storyDetailState, this.selectedPost, {
        onOpenStoryUrl: () => this.openStoryUrl(),
      });
    }

    this.authSetupState = null;
  }

  private saveApiKey(provider: Provider, apiKey: string) {
    const config = loadConfig();
    config.provider = provider;
    if (provider === "anthropic") {
      config.anthropicApiKey = apiKey;
    } else {
      config.openaiApiKey = apiKey;
    }
    saveConfig(config);

    this.hideAuthSetup();
    this.chatServiceState = initChatServiceState(provider);
    this.showChatView();
  }

  private showSettings() {
    this.settingsMode = true;
    this.settingsState = initSettingsState();

    // Blur the chat input to remove cursor
    if (this.chatPanelState?.input) {
      this.chatPanelState.input.blur();
    }

    // Save the chat session before switching to settings
    if (this.selectedPost && this.chatPanelState) {
      this.savedChatSessions.set(this.selectedPost.id, {
        messages: [...this.chatPanelState.messages],
        suggestions: [...this.chatPanelState.suggestions.suggestions],
        originalSuggestions: [...this.chatPanelState.suggestions.originalSuggestions],
        followUpCount: this.followUpCount,
      });
    }

    // Remove chat components
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    this.rerenderSettings();
  }

  private rerenderSettings() {
    if (!this.settingsState) return;

    // Clear existing
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    const settingsUI = renderSettings(
      this.ctx,
      this.settingsState,
      this.chatServiceState?.provider || "anthropic",
    );
    this.storyDetailState.panel.add(settingsUI);
  }

  private hideSettings() {
    this.settingsMode = false;

    // Remove settings components
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    // Re-create and add chat panel
    if (this.selectedPost && this.chatServiceState) {
      this.chatPanelState = createChatPanel(this.ctx, this.selectedPost, {
        onOpenStoryUrl: () => this.openStoryUrl(),
        onSubmit: () => this.sendChatMessage(),
      });

      for (const child of this.chatPanelState.panel.getChildren()) {
        this.storyDetailState.panel.add(child);
      }

      // Restore saved session if available
      const savedSession = this.savedChatSessions.get(this.selectedPost.id);
      if (savedSession) {
        this.followUpCount = savedSession.followUpCount;
        this.chatPanelState.messages = [...savedSession.messages];
        this.chatPanelState.suggestions.suggestions = [...savedSession.suggestions];
        this.chatPanelState.suggestions.originalSuggestions = [...savedSession.originalSuggestions];
        this.chatPanelState.suggestions.selectedIndex = savedSession.suggestions.length > 0
          ? savedSession.suggestions.length - 1
          : -1;
      }

      // Render messages and focus input
      renderChatMessages(this.ctx, this.chatPanelState, this.chatServiceState.provider);

      if (this.chatPanelState.input) {
        this.chatPanelState.input.focus();
        this.chatPanelState.input.clear();
      }

      // Render suggestions (either restored from saved session or default)
      renderSuggestions(this.ctx, this.chatPanelState.suggestions);
    }

    this.settingsState = null;
  }

  private async refresh() {
    await this.loadPosts();
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
    return this.storyDetailState.rootCommentBoxes.length;
  }

  setPostsForTesting(posts: HackerNewsPost[]) {
    this.posts = posts;
    renderStoryList(this.ctx, this.storyListState, this.posts, this.selectedIndex, {
      onSelect: (index) => this.selectStory(index),
    });
  }

  async setSelectedPostForTesting(post: HackerNewsPost) {
    this.selectedPost = post;
    renderStoryDetail(this.ctx, this.storyDetailState, post, {
      onOpenStoryUrl: () => this.openStoryUrl(),
    });
  }
}
