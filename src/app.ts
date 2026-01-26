import { BoxRenderable, type CliRenderer, type RenderContext } from "@opentui/core";
import { log } from "./logger";
import * as telemetry from "./telemetry";
import { getRankedPosts, getPostById } from "./api";
import type { HackerNewsPost } from "./types";
import {
  type Provider,
  getConfiguredProvider,
  hasAnyApiKey,
  setModel,
  saveConfig,
  loadConfig,
  clearAllApiKeys,
  isTelemetryEnabled,
  setTelemetryEnabled,
} from "./config";
import { type UpdateInfo } from "./version";
import { COLORS, detectTheme } from "./theme";
import { LOADING_CHARS } from "./utils";

// Import components
import {
  createHeader,
  startLoadingAnimation,
  stopLoadingAnimation,
  showUpdateNotification,
  type HeaderState,
} from "./components/Header";
import {
  createStoryList,
  renderStoryList,
  updateStorySelection,
  scrollToStory,
  updateStoryIndicator,
  showStoryListNotification,
  type StoryListState,
} from "./components/StoryList";
import {
  createStoryDetail,
  renderStoryDetail,
  scrollToRootComment,
  showDetailComponents,
  hideDetailComponents,
  type StoryDetailState,
} from "./components/StoryDetail";
import {
  createEmptyState,
  startEmptyStateAnimation,
  stopEmptyStateAnimation,
  type EmptyStateState,
} from "./components/EmptyState";
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
  adjustSettingValue,
  goBackInSettings,
  getSelectedProviderUrl,
  type SettingsState,
  type SettingsAction,
} from "./components/SettingsPanel";
import { updateSetting, resetSettings, loadSettings, type FilterSettings } from "./settings";

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
import { generateTLDR, type TLDRResult } from "./services/TLDRService";
import {
  loadCache,
  saveCache,
  clearCache,
  chatSessionsToCache,
  cacheToSessions,
  viewModesToCache,
  cacheToViewModes,
  loadTLDRCache,
  saveTLDRCache,
  loadChatCache,
  saveChatCache,
  type AppCache,
  type CachedChatSession,
  type StoryViewMode,
} from "./cache";

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

export interface InitializeOptions {
  requestedStoryId?: number;
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
  private emptyStateState!: EmptyStateState;
  private chatPanelState: ChatPanelState | null = null;
  private authSetupState: AuthSetupState | null = null;
  private settingsState: SettingsState | null = null;
  private chatServiceState: ChatServiceState | null = null;

  // Saved chat sessions per story (keyed by story ID)
  private savedChatSessions: Map<number, SavedChatSession> = new Map();

  // Per-story view mode: "comments" or "chat"
  private storyViewModes: Map<number, "comments" | "chat"> = new Map();

  // UI mode flags
  private chatMode = false;
  private authSetupMode = false;
  private settingsMode = false;
  private authSetupFromSettings = false; // Track if auth setup was triggered from settings
  private settingsFromChatMode = false; // Track if settings was opened from chat mode
  private settingsIntent: "settings" | "chat" | "tldr" = "settings"; // Track why settings was opened

  // Update notification state
  private updateInfo: UpdateInfo | null = null;

  // Follow-up questions state
  private followUpCount = 0;
  // Track pending generation per story ID (not globally)
  private pendingGenerationStoryIds: Set<number> = new Set();
  // Track loading intervals so we can cancel them when switching stories
  private suggestionLoadingInterval: ReturnType<typeof setInterval> | null = null;

  // Cache timestamp for when stories were fetched
  private storiesFetchedAt = 0;

  // TLDR cache (keyed by story ID, cleared on app quit or regeneration)
  private tldrCache: Map<number, TLDRResult> = new Map();
  private tldrErrorIds: Set<number> = new Set(); // Track stories with TLDR errors
  private tldrLoading = false;
  private tldrLoadingStoryId: number | null = null; // Track which story is loading TLDR
  private tldrLoadingFrame = 0;
  private tldrLoadingInterval: ReturnType<typeof setInterval> | null = null;

  // AI activity indicator (shows loading animation on story list chevron)
  private aiActiveIndices: Set<number> = new Set();
  private aiIndicatorFrame = 0;
  private aiIndicatorInterval: ReturnType<typeof setInterval> | null = null;

  // Requested story ID from command line flag
  private requestedStoryId: number | undefined;

  constructor(renderer: CliRenderer, callbacks: AppCallbacks = {}) {
    this.renderer = renderer;
    this.ctx = renderer;
    this.callbacks = callbacks;
  }

  private saveToCache() {
    const cache: AppCache = {
      posts: this.posts,
      selectedIndex: this.selectedIndex,
      selectedPost: this.selectedPost,
      rootCommentIndex: this.rootCommentIndex,
      chatMode: this.chatMode,
      settingsMode: this.settingsMode,
      chatSessions: chatSessionsToCache(this.savedChatSessions as Map<number, CachedChatSession>),
      storyViewModes: viewModesToCache(this.storyViewModes),
      storiesFetchedAt: this.storiesFetchedAt,
      savedAt: Date.now(),
    };
    saveCache(cache);

    // Also save persistent caches (TLDR and chat history with 7-day expiry)
    saveTLDRCache(this.tldrCache);
    saveChatCache(this.savedChatSessions as Map<number, CachedChatSession>);
  }

  async initialize(options: InitializeOptions = {}) {
    this.requestedStoryId = options.requestedStoryId;

    await detectTheme(this.renderer);
    this.setupLayout();
    this.setupKeyboardHandlers();

    // Load persistent caches (TLDR and chat history with 7-day expiry)
    this.tldrCache = loadTLDRCache();
    const persistentChatSessions = loadChatCache();

    // If a specific story is requested, skip session cache and load fresh
    if (this.requestedStoryId) {
      this.savedChatSessions = persistentChatSessions;
      await this.loadPosts();
      return;
    }

    // Try to restore from cache first
    const cached = loadCache();
    if (cached && cached.posts.length > 0) {
      await this.restoreFromCache(cached, persistentChatSessions);
    } else {
      // Even if no session cache, restore persistent chat sessions
      this.savedChatSessions = persistentChatSessions;
      await this.loadPosts();
    }
  }

  private async restoreFromCache(cached: AppCache, persistentChatSessions?: Map<number, CachedChatSession>) {
    this.posts = cached.posts;
    this.storiesFetchedAt = cached.storiesFetchedAt;

    // Merge session chat cache with persistent chat cache.
    // Persistent takes precedence because: on reboot, session cache (in tmpdir) is cleared
    // while persistent cache (in ~/.cache) survives. On clean shutdown, both are identical.
    const sessionChats = cacheToSessions(cached.chatSessions) as Map<number, SavedChatSession>;
    this.savedChatSessions = persistentChatSessions
      ? new Map([...sessionChats, ...persistentChatSessions]) as Map<number, SavedChatSession>
      : sessionChats;

    this.storyViewModes = cached.storyViewModes
      ? cacheToViewModes(cached.storyViewModes)
      : new Map();

    // Remove loading state and add the main layout
    this.contentArea.remove(this.emptyStateState.container.id);
    this.contentArea.add(this.storyListState.panel);
    this.contentArea.add(this.storyDetailState.panel);
    showDetailComponents(this.storyDetailState);

    renderStoryList(this.ctx, this.storyListState, this.posts, cached.selectedIndex, {
      onSelect: (index) => this.selectStory(index),
    });

    // Restore selection
    if (cached.selectedIndex >= 0 && cached.selectedIndex < this.posts.length) {
      await this.selectStory(cached.selectedIndex);

      // Restore chat mode if it was active
      if (cached.chatMode && this.selectedPost) {
        this.showChatView();
      }
      // Restore settings mode if it was active
      else if (cached.settingsMode) {
        this.showSettings();
      }
    } else if (this.posts.length > 0) {
      await this.selectStory(0);
    }
  }

  initializeForTesting() {
    this.setupLayout();
    this.setupKeyboardHandlers();
  }

  setUpdateInfo(info: UpdateInfo) {
    this.updateInfo = info;
    showUpdateNotification(this.headerState, this.updateInfo);
  }

  startHeaderLoading() {
    startLoadingAnimation(this.headerState, () => this.renderer.isDestroyed);
  }

  stopHeaderLoading() {
    stopLoadingAnimation(this.headerState);
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
    const { header, state: headerState } = createHeader(this.ctx, {});
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

    // Create empty state (shown initially while loading - takes full width)
    this.emptyStateState = createEmptyState(this.ctx);
    this.contentArea.add(this.emptyStateState.container);

    // Note: storyList and storyDetail panels are NOT added initially
    // They are added after posts load (see loadPosts)

    mainContainer.add(header);
    mainContainer.add(this.contentArea);

    this.renderer.root.add(mainContainer);
  }

  private setupKeyboardHandlers() {
    this.renderer.keyInput.on("keypress", (key) => {
      if (key.ctrl && key.name === "c") {
        this.callbacks.onExit?.();
        return;
      }

      // Cmd+C to copy selected text to clipboard
      if (key.super && key.name === "c") {
        this.copySelectionToClipboard();
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
      navigateSettings(this.settingsState, 1, getConfiguredProvider() || "anthropic");
      this.rerenderSettings();
    } else if (key.name === "k" || key.name === "up") {
      navigateSettings(this.settingsState, -1, getConfiguredProvider() || "anthropic");
      this.rerenderSettings();
    } else if (key.name === "tab") {
      // Open API key URL if a provider without a key is selected
      const url = getSelectedProviderUrl(
        this.settingsState,
        getConfiguredProvider() || "anthropic",
      );
      if (url) {
        this.callbacks.onOpenUrl?.(url);
      }
    } else if (key.name === "left" || key.name === "h") {
      // Decrease setting value
      const action = adjustSettingValue(
        this.settingsState,
        getConfiguredProvider() || "anthropic",
        -1,
      );
      if (action) {
        this.handleSettingsAction(action);
      }
    } else if (key.name === "right" || key.name === "l") {
      // Increase setting value
      const action = adjustSettingValue(
        this.settingsState,
        getConfiguredProvider() || "anthropic",
        1,
      );
      if (action) {
        this.handleSettingsAction(action);
      }
    } else if (key.name === "return" || key.name === "enter") {
      const action = selectSettingsItem(
        this.settingsState,
        getConfiguredProvider() || "anthropic",
      );
      if (action) {
        this.handleSettingsAction(action);
      }
    }
  }

  private handleSettingsAction(action: NonNullable<SettingsAction>) {
    switch (action.type) {
      case "switch_provider":
        const switchConfig = loadConfig();
        switchConfig.provider = action.provider;
        saveConfig(switchConfig);
        if (this.chatServiceState) {
          setProvider(this.chatServiceState, action.provider);
          resetChatServiceClients(this.chatServiceState);
        }
        this.rerenderSettings();
        break;

      case "done":
        this.hideSettings();
        break;

      case "add_anthropic":
        this.authSetupFromSettings = true;
        this.settingsMode = false;
        this.settingsState = null;
        // Clear settings UI
        for (const child of this.storyDetailState.panel.getChildren()) {
          this.storyDetailState.panel.remove(child.id);
        }
        this.authSetupState = initAuthSetupState();
        this.authSetupState.selectedProvider = "anthropic";
        this.authSetupState.step = "key";
        this.authSetupMode = true;
        this.showAuthSetupUI();
        break;

      case "add_openai":
        this.authSetupFromSettings = true;
        this.settingsMode = false;
        this.settingsState = null;
        // Clear settings UI
        for (const child of this.storyDetailState.panel.getChildren()) {
          this.storyDetailState.panel.remove(child.id);
        }
        this.authSetupState = initAuthSetupState();
        this.authSetupState.selectedProvider = "openai";
        this.authSetupState.step = "key";
        this.authSetupMode = true;
        this.showAuthSetupUI();
        break;

      case "clear_keys":
        clearAllApiKeys();
        // Reset chat state completely - user can't chat without API keys
        this.chatServiceState = null;
        this.chatMode = false;
        // Ensure we go to comments view, not chat view
        this.settingsFromChatMode = false;
        // Clear all saved chat sessions since they're no longer usable
        this.savedChatSessions.clear();
        // Reset story view modes to comments
        this.storyViewModes.clear();
        this.hideSettings();
        break;

      case "select_model":
        setModel(action.provider, action.modelId);
        if (this.chatServiceState) {
          resetChatServiceClients(this.chatServiceState);
        }
        this.rerenderSettings();
        break;

      case "toggle_telemetry":
        setTelemetryEnabled(!isTelemetryEnabled());
        this.rerenderSettings();
        break;

      case "adjust_setting":
        updateSetting(action.key, loadSettings()[action.key] + action.delta);
        this.rerenderSettings();
        break;

      case "reset_filters":
        resetSettings();
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

    // Cmd+j/Cmd+k to navigate between stories
    if (key.super && (key.name === "j" || key.name === "k")) {
      const delta = key.name === "j" ? 1 : -1;
      this.navigateStory(delta);
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
        if (suggestionsState.selectedIndex === -1) {
          // Input was focused with no selection, select the last suggestion
          suggestionsState.selectedIndex = suggestionsState.suggestions.length - 1;
        } else if (suggestionsState.selectedIndex > 0) {
          // Move up in suggestions
          suggestionsState.selectedIndex--;
        }
        // Blur input when navigating suggestions
        this.chatPanelState.input.blur();
        renderSuggestions(this.ctx, suggestionsState);
        return;
      } else if (key.name === "down" || key.name === "j") {
        if (suggestionsState.selectedIndex === suggestionsState.suggestions.length - 1) {
          // At the last suggestion, focus the input and deselect
          suggestionsState.selectedIndex = -1;
          this.chatPanelState.input.focus();
        } else if (suggestionsState.selectedIndex >= 0) {
          // Move down in suggestions, blur input
          suggestionsState.selectedIndex++;
          this.chatPanelState.input.blur();
        }
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
        this.chatPanelState.input.focus();
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

    // Clear suggestions and focus input when user starts typing
    if (
      suggestionsState.suggestions.length > 0 &&
      key.sequence &&
      key.sequence.length === 1 &&
      !key.ctrl &&
      !key.meta
    ) {
      const charCode = key.sequence.charCodeAt(0);
      if (charCode >= 32 && charCode <= 126) {
        // Focus input if it was blurred while browsing suggestions
        if (this.chatPanelState.input) {
          this.chatPanelState.input.focus();
        }
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
    if (key.name === "s") {
      telemetry.track("settings_opened");
      this.settingsIntent = "settings";
      this.showSettings();
      return;
    }

    if (key.name === "j") {
      this.navigateStory(1);
    } else if (key.name === "k") {
      this.navigateStory(-1);
    } else if (key.name === "space" || key.name === " ") {
      telemetry.track("comment_nav");
      // Space navigates to next root comment only (forward)
      this.navigateToNextComment();
    } else if (key.name === "o") {
      telemetry.track("url_opened", { type: "url" });
      this.openStoryUrl();
    } else if (key.name === "c") {
      telemetry.track("chat_opened");
      this.openChat();
    } else if (key.name === "r") {
      telemetry.track("refresh");
      this.refresh();
    } else if (key.name === "t") {
      telemetry.track("tldr_requested");
      this.handleTldrRequest();
    }
  }

  private async loadPosts() {
    // Start full-screen loading animation (header loading is reserved for update checks)
    startEmptyStateAnimation(this.emptyStateState, "loading", () => this.renderer.isDestroyed);

    try {
      this.posts = await getRankedPosts();
      this.storiesFetchedAt = Date.now();

      // Handle requested story ID from command line flag
      let initialStoryIndex = 0;
      let storyNotFound = false;
      if (this.requestedStoryId) {
        const result = await this.handleRequestedStory();
        initialStoryIndex = result.index;
        storyNotFound = !result.found;
      }

      stopEmptyStateAnimation(this.emptyStateState);

      // Remove loading state and add the main layout
      this.contentArea.remove(this.emptyStateState.container.id);
      this.contentArea.add(this.storyListState.panel);
      this.contentArea.add(this.storyDetailState.panel);

      // Show the detail components (header, scroll, shortcuts) now that layout is ready
      showDetailComponents(this.storyDetailState);

      renderStoryList(this.ctx, this.storyListState, this.posts, this.selectedIndex, {
        onSelect: (index) => this.selectStory(index),
      });

      // Show notification if requested story was not found
      if (storyNotFound) {
        showStoryListNotification(
          this.storyListState,
          `Story ${this.requestedStoryId} not found`,
        );
      }

      // Auto-select story (requested story index or first story)
      if (this.posts.length > 0) {
        await this.selectStory(initialStoryIndex);
      }

      this.saveToCache();
    } catch (error) {
      stopEmptyStateAnimation(this.emptyStateState);
      log("[ERROR]", "Error loading posts:", error);
    }
  }

  private async handleRequestedStory(): Promise<{ index: number; found: boolean }> {
    if (!this.requestedStoryId) return { index: 0, found: true };

    // Check if the requested story is already in the posts list
    const existingIndex = this.posts.findIndex((p) => p.id === this.requestedStoryId);

    if (existingIndex !== -1) {
      // Story exists in list - keep it in place, return its index
      return { index: existingIndex, found: true };
    } else {
      // Story not in list - fetch it and prepend to index 0
      const requestedPost = await getPostById(this.requestedStoryId);
      if (requestedPost) {
        this.posts.unshift(requestedPost);
        return { index: 0, found: true };
      }
      // Story could not be fetched
      return { index: 0, found: false };
    }
  }

  async selectStory(index: number) {
    if (index < 0 || index >= this.posts.length) return;
    if (this.renderer.isDestroyed) return;

    telemetry.track("story_selected");

    // Stop TLDR loading animation in detail view when switching stories
    // (TLDR generation continues in background - AI indicator keeps showing)
    if (this.tldrLoading) {
      this.stopTldrLoadingAnimation();
    }

    // If we're in chat mode, save the current chat session before switching
    if (this.chatMode && this.selectedPost && this.chatPanelState) {
      this.savedChatSessions.set(this.selectedPost.id, {
        messages: [...this.chatPanelState.messages],
        suggestions: [...this.chatPanelState.suggestions.suggestions],
        originalSuggestions: [...this.chatPanelState.suggestions.originalSuggestions],
        followUpCount: this.followUpCount,
      });
      // Cancel any pending loading interval
      this.cancelSuggestionLoadingInterval();
      // Blur and cleanup current chat
      if (this.chatPanelState.input) {
        this.chatPanelState.input.blur();
      }
      if (this.chatPanelState) {
        this.chatPanelState.isActive = false;
      }
      this.chatPanelState = null;
    }

    const previousIndex = this.selectedIndex;
    this.selectedIndex = index;
    this.rootCommentIndex = 0;

    updateStorySelection(this.storyListState, this.posts, previousIndex, index);

    const post = this.posts[index];
    if (!post) return;

    // Clear the detail panel before loading new content
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    try {
      const fullPost = await getPostById(post.id);
      if (this.renderer.isDestroyed) return;
      if (fullPost) {
        this.selectedPost = fullPost;

        // Check if this story should be in chat mode
        const viewMode = this.storyViewModes.get(post.id) || "comments";
        if (viewMode === "chat" && this.chatServiceState) {
          this.chatMode = true;
          this.showChatViewForCurrentStory();
        } else {
          this.chatMode = false;
          // Show comments view
          this.storyDetailState.panel.add(this.storyDetailState.header);
          this.storyDetailState.panel.add(this.storyDetailState.scroll);
          this.storyDetailState.panel.add(this.storyDetailState.shortcutsBar);
          // Check if this story is currently loading TLDR
          const isLoadingTldr = this.tldrLoading && this.tldrLoadingStoryId === fullPost.id;
          const cachedTldr = this.tldrCache.get(fullPost.id) || null;
          const hasError = this.tldrErrorIds.has(fullPost.id);
          renderStoryDetail(this.ctx, this.storyDetailState, fullPost, {
            onOpenStoryUrl: () => this.openStoryUrl(),
          }, {
            tldr: cachedTldr,
            isLoading: isLoadingTldr,
            loadingFrame: this.tldrLoadingFrame,
            hasError,
          });
          // Restart loading animation if this story is loading
          if (isLoadingTldr) {
            this.startTldrLoadingAnimation();
          }
        }
      }
    } catch (error) {
      log("[ERROR]", "Error loading post:", error);
    }

    if (this.renderer.isDestroyed) return;
    scrollToStory(this.storyListState, index);
    this.saveToCache();
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

  private handleTldrRequest() {
    if (!this.selectedPost) return;

    // If no API key, go to settings to add one
    // After adding, will automatically generate TLDR
    if (!hasAnyApiKey()) {
      this.settingsIntent = "tldr";
      this.showSettings();
      return;
    }

    // If already loading, ignore
    if (this.tldrLoading) return;

    const storyId = this.selectedPost.id;

    // Clear any existing TLDR or error state and regenerate
    this.tldrCache.delete(storyId);
    this.tldrErrorIds.delete(storyId);

    // Get the configured provider
    const provider = getConfiguredProvider();
    if (!provider) return;

    // Start loading with animation
    this.tldrLoading = true;
    this.tldrLoadingStoryId = storyId;
    this.tldrLoadingFrame = 0;
    this.rerenderCurrentStory();

    // Start AI indicator on story list
    this.startAiIndicator(this.selectedIndex);

    // Start loading animation interval (for detail view)
    this.startTldrLoadingAnimation();

    const storyIndex = this.selectedIndex;

    // Generate TLDR
    generateTLDR(this.selectedPost, provider, {
      onComplete: (tldr) => {
        if (this.renderer.isDestroyed) return;
        telemetry.track("tldr_completed", { success: true });
        this.tldrCache.set(storyId, tldr);
        this.tldrLoading = false;
        this.tldrLoadingStoryId = null;
        this.stopTldrLoadingAnimation();
        this.stopAiIndicator(storyIndex);
        // Persist TLDR cache immediately
        saveTLDRCache(this.tldrCache);
        // Only rerender if we're viewing the story that just completed
        if (this.selectedPost?.id === storyId) {
          this.rerenderCurrentStory();
        }
      },
      onError: (error) => {
        telemetry.track("tldr_completed", { success: false });
        log("[ERROR]", "TLDR generation failed:", error);
        this.tldrErrorIds.add(storyId);
        this.tldrLoading = false;
        this.tldrLoadingStoryId = null;
        this.stopTldrLoadingAnimation();
        this.stopAiIndicator(storyIndex);
        // Only rerender if we're viewing the story that failed
        if (this.selectedPost?.id === storyId) {
          this.rerenderCurrentStory();
        }
      },
    });
  }

  private startTldrLoadingAnimation() {
    this.stopTldrLoadingAnimation(); // Clear any existing interval
    this.tldrLoadingInterval = setInterval(() => {
      if (this.renderer.isDestroyed || !this.tldrLoading) {
        this.stopTldrLoadingAnimation();
        return;
      }
      // Only animate if we're viewing the loading story
      if (this.selectedPost?.id === this.tldrLoadingStoryId) {
        this.tldrLoadingFrame = (this.tldrLoadingFrame + 1) % 10;
        this.rerenderCurrentStory();
      }
    }, 80);
  }

  private stopTldrLoadingAnimation() {
    if (this.tldrLoadingInterval) {
      clearInterval(this.tldrLoadingInterval);
      this.tldrLoadingInterval = null;
    }
  }

  private startAiIndicator(index: number) {
    this.aiActiveIndices.add(index);

    // Start animation interval if not already running
    if (!this.aiIndicatorInterval) {
      this.aiIndicatorInterval = setInterval(() => {
        if (this.renderer.isDestroyed || this.aiActiveIndices.size === 0) {
          this.stopAiIndicatorAnimation();
          return;
        }
        this.aiIndicatorFrame = (this.aiIndicatorFrame + 1) % LOADING_CHARS.length;
        const loadingChar = LOADING_CHARS[this.aiIndicatorFrame]!;
        for (const idx of this.aiActiveIndices) {
          updateStoryIndicator(this.storyListState, idx, loadingChar);
        }
      }, 80);
    }
  }

  private stopAiIndicator(index: number) {
    this.aiActiveIndices.delete(index);

    // Restore the chevron for this story
    const isSelected = index === this.selectedIndex;
    updateStoryIndicator(this.storyListState, index, isSelected ? "\u203A" : "\u2022");

    // Stop animation if no more active indicators
    if (this.aiActiveIndices.size === 0) {
      this.stopAiIndicatorAnimation();
    }
  }

  private stopAiIndicatorAnimation() {
    if (this.aiIndicatorInterval) {
      clearInterval(this.aiIndicatorInterval);
      this.aiIndicatorInterval = null;
    }
  }

  private rerenderCurrentStory() {
    if (!this.selectedPost || this.chatMode) return;

    const storyId = this.selectedPost.id;
    const tldr = this.tldrCache.get(storyId) || null;
    // Only show loading state if THIS story is the one loading
    const isLoadingThisStory = this.tldrLoading && this.tldrLoadingStoryId === storyId;
    const hasError = this.tldrErrorIds.has(storyId);

    renderStoryDetail(this.ctx, this.storyDetailState, this.selectedPost, {
      onOpenStoryUrl: () => this.openStoryUrl(),
    }, {
      tldr,
      isLoading: isLoadingThisStory,
      loadingFrame: this.tldrLoadingFrame,
      hasError,
    });
  }

  private showChatViewForCurrentStory() {
    if (!this.selectedPost || !this.chatServiceState) return;

    // Create and add chat panel
    this.chatPanelState = createChatPanel(this.ctx, this.selectedPost, {
      onOpenStoryUrl: () => this.openStoryUrl(),
      onSubmit: () => this.sendChatMessage(),
    });

    // Add chat panel children directly to detail panel
    for (const child of this.chatPanelState.panel.getChildren()) {
      this.storyDetailState.panel.add(child);
    }

    // Check if there's a saved session for this story
    const savedSession = this.savedChatSessions.get(this.selectedPost.id);

    if (savedSession) {
      // Restore the saved session
      this.followUpCount = savedSession.followUpCount;
      this.chatPanelState.messages = [...savedSession.messages];

      // Re-render restored messages
      renderChatMessages(this.ctx, this.chatPanelState, this.chatServiceState.provider);
    } else {
      // Fresh session - add initial assistant message
      this.followUpCount = 0;
      addChatMessage(
        this.ctx,
        this.chatPanelState,
        "assistant",
        `Ask me anything about "${this.selectedPost.title}" or the discussion about it on Hacker News...`,
        this.chatServiceState.provider,
      );
    }

    // Restore or generate suggestions
    this.restoreSuggestionsFromSession(savedSession);
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
      // No API key configured - go to settings to add one
      // After adding, will automatically proceed to chat
      this.settingsIntent = "chat";
      this.showSettings();
    }
  }

  private showChatView() {
    if (!this.selectedPost || !this.chatServiceState) return;

    this.chatMode = true;

    // Track that this story is in chat mode
    this.storyViewModes.set(this.selectedPost.id, "chat");

    // Remove detail view components (keep story list visible)
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

    // Check if there's a saved session for this story
    const savedSession = this.savedChatSessions.get(this.selectedPost.id);

    if (savedSession) {
      // Restore the saved session
      this.followUpCount = savedSession.followUpCount;
      this.chatPanelState.messages = [...savedSession.messages];

      // Re-render restored messages
      renderChatMessages(this.ctx, this.chatPanelState, this.chatServiceState.provider);
    } else {
      // Fresh session - add initial assistant message
      this.followUpCount = 0;
      addChatMessage(
        this.ctx,
        this.chatPanelState,
        "assistant",
        `Ask me anything about "${this.selectedPost.title}" or the discussion about it on Hacker News...`,
        this.chatServiceState.provider,
      );
    }

    // Restore or generate suggestions
    this.restoreSuggestionsFromSession(savedSession);

    this.saveToCache();
  }

  private hideChatView() {
    if (!this.chatMode) return;

    this.chatMode = false;

    // Track that this story is now in comments mode
    if (this.selectedPost) {
      this.storyViewModes.set(this.selectedPost.id, "comments");
    }

    // Cancel any pending loading interval
    this.cancelSuggestionLoadingInterval();

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

    // Remove chat components (story list stays visible)
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    // Re-add detail view components
    this.storyDetailState.panel.add(this.storyDetailState.header);
    this.storyDetailState.panel.add(this.storyDetailState.scroll);
    this.storyDetailState.panel.add(this.storyDetailState.shortcutsBar);

    // Re-render the current story with cached TLDR if available
    if (this.selectedPost) {
      const cachedTldr = this.tldrCache.get(this.selectedPost.id) || null;
      const hasError = this.tldrErrorIds.has(this.selectedPost.id);
      renderStoryDetail(this.ctx, this.storyDetailState, this.selectedPost, {
        onOpenStoryUrl: () => this.openStoryUrl(),
      }, {
        tldr: cachedTldr,
        isLoading: false,
        hasError,
      });
    }

    // Mark panel as inactive before nullifying to prevent stale setTimeout callbacks
    if (this.chatPanelState) {
      this.chatPanelState.isActive = false;
    }
    this.chatPanelState = null;

    this.saveToCache();
  }

  private async sendChatMessage() {
    if (!this.chatPanelState || !this.chatServiceState || this.chatServiceState.isStreaming) return;

    const userMessage = this.chatPanelState.input.plainText.trim();
    if (!userMessage) return;

    telemetry.track("chat_message");

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

    // Start AI indicator on story list
    const storyIndex = this.selectedIndex;
    this.startAiIndicator(storyIndex);

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
          this.stopAiIndicator(storyIndex);
          // Save current chat session before persisting cache
          if (this.selectedPost && this.chatPanelState) {
            this.savedChatSessions.set(this.selectedPost.id, {
              messages: [...this.chatPanelState.messages],
              suggestions: [...this.chatPanelState.suggestions.suggestions],
              originalSuggestions: [...this.chatPanelState.suggestions.originalSuggestions],
              followUpCount: this.followUpCount,
            });
          }
          this.saveToCache();
          this.generateFollowUpQuestionsIfNeeded();
        },
        onError: (error) => {
          if (this.chatPanelState) {
            stopTypingIndicator(this.chatPanelState);
          }
          this.stopAiIndicator(storyIndex);
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

  private cancelSuggestionLoadingInterval() {
    if (this.suggestionLoadingInterval) {
      clearInterval(this.suggestionLoadingInterval);
      this.suggestionLoadingInterval = null;
    }
  }

  /**
   * Restores suggestions from a saved session or generates new ones.
   * Handles three cases:
   * 1. Saved session with suggestions → restore them
   * 2. Saved session with messages but no suggestions → generate follow-ups
   * 3. No saved session → generate initial suggestions
   */
  private restoreSuggestionsFromSession(savedSession: SavedChatSession | undefined) {
    if (!this.chatPanelState) return;

    if (savedSession && savedSession.suggestions.length > 0) {
      // Restore saved suggestions (no regeneration needed)
      this.chatPanelState.suggestions.suggestions = [...savedSession.suggestions];
      this.chatPanelState.suggestions.originalSuggestions = [...savedSession.originalSuggestions];
      this.chatPanelState.suggestions.selectedIndex = savedSession.suggestions.length - 1;
      this.chatPanelState.suggestions.loading = false;
      renderSuggestions(this.ctx, this.chatPanelState.suggestions);
    } else if (savedSession && savedSession.messages.length > 0) {
      // Has conversation history but no saved suggestions - generate follow-up suggestions
      this.chatPanelState.suggestions.loading = true;
      renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      this.generateFollowUpQuestionsIfNeeded();
    } else {
      // No conversation - generate initial suggestions
      this.chatPanelState.suggestions.loading = true;
      renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      this.generateInitialSuggestions();
    }
  }

  private async generateInitialSuggestions() {
    if (!this.selectedPost || !this.chatPanelState || !this.chatServiceState) return;

    const storyId = this.selectedPost.id;
    const suggestionsState = this.chatPanelState.suggestions;

    // Mark this story as having pending generation
    this.pendingGenerationStoryIds.add(storyId);

    // Cancel any previous loading interval
    this.cancelSuggestionLoadingInterval();

    // Start loading animation
    this.suggestionLoadingInterval = setInterval(() => {
      // Check if we're still on the same story and panel is active
      if (
        !this.renderer.isDestroyed &&
        this.chatPanelState?.isActive &&
        this.selectedPost?.id === storyId &&
        this.chatPanelState.suggestions.loading
      ) {
        this.chatPanelState.suggestions.loadingFrame =
          (this.chatPanelState.suggestions.loadingFrame + 1) % LOADING_CHARS.length;
        renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      }
    }, 80);

    try {
      const questions = await generateSuggestions(this.chatServiceState, this.selectedPost);

      this.cancelSuggestionLoadingInterval();
      this.pendingGenerationStoryIds.delete(storyId);

      // Only update if still on the same story
      if (this.selectedPost?.id === storyId && this.chatPanelState?.isActive) {
        this.chatPanelState.suggestions.loading = false;

        if (questions.length > 0) {
          this.chatPanelState.suggestions.suggestions = questions;
          this.chatPanelState.suggestions.originalSuggestions = [...questions];
          this.chatPanelState.suggestions.selectedIndex = questions.length - 1;
        }
        renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      }
    } catch (error) {
      this.cancelSuggestionLoadingInterval();
      this.pendingGenerationStoryIds.delete(storyId);

      // Only update if still on the same story
      if (this.selectedPost?.id === storyId && this.chatPanelState?.isActive) {
        this.chatPanelState.suggestions.loading = false;
        renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      }
      log("[ERROR]", "[suggestions] Error:", error);
    }
  }

  private async generateFollowUpQuestionsIfNeeded() {
    if (this.followUpCount >= MAX_FOLLOW_UP_ROUNDS) return;
    if (!this.chatPanelState || !this.chatServiceState || !this.selectedPost) return;

    const storyId = this.selectedPost.id;

    // Check if already generating for this story
    if (this.pendingGenerationStoryIds.has(storyId)) return;

    const hasAssistantMessage = this.chatPanelState.messages.some((m) => m.role === "assistant");
    if (!hasAssistantMessage) return;

    // Mark this story as having pending generation
    this.pendingGenerationStoryIds.add(storyId);
    this.chatPanelState.suggestions.loading = true;
    renderSuggestions(this.ctx, this.chatPanelState.suggestions);

    // Cancel any previous loading interval
    this.cancelSuggestionLoadingInterval();

    this.suggestionLoadingInterval = setInterval(() => {
      // Check if we're still on the same story and panel is active
      if (
        !this.renderer.isDestroyed &&
        this.chatPanelState?.isActive &&
        this.selectedPost?.id === storyId &&
        this.chatPanelState.suggestions.loading
      ) {
        this.chatPanelState.suggestions.loadingFrame =
          (this.chatPanelState.suggestions.loadingFrame + 1) % LOADING_CHARS.length;
        renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      }
    }, 80);

    try {
      const questions = await generateFollowUpQuestions(
        this.chatServiceState,
        this.selectedPost,
        this.chatPanelState.messages,
      );

      this.cancelSuggestionLoadingInterval();
      this.pendingGenerationStoryIds.delete(storyId);

      // Only update if still on the same story
      if (this.selectedPost?.id === storyId && this.chatPanelState?.isActive) {
        this.chatPanelState.suggestions.loading = false;

        if (questions.length > 0) {
          this.chatPanelState.suggestions.suggestions = questions;
          this.chatPanelState.suggestions.originalSuggestions = [...questions];
          this.chatPanelState.suggestions.selectedIndex = questions.length - 1;
          this.followUpCount++;
        }

        renderSuggestions(this.ctx, this.chatPanelState.suggestions);
        scrollChatToBottom(this.chatPanelState);
      }
    } catch (error) {
      this.cancelSuggestionLoadingInterval();
      this.pendingGenerationStoryIds.delete(storyId);

      // Only update if still on the same story
      if (this.selectedPost?.id === storyId && this.chatPanelState?.isActive) {
        this.chatPanelState.suggestions.loading = false;
        renderSuggestions(this.ctx, this.chatPanelState.suggestions);
      }
      log("[ERROR]", "[follow-up] Error:", error);
    } finally {
      this.saveToCache();
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

    // Blur the input field to clear cursor state
    if (this.authSetupState?.keyInput) {
      this.authSetupState.keyInput.blur();
    }

    // Remove auth setup components
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    // If we came from settings, go back to settings
    if (this.authSetupFromSettings) {
      this.authSetupFromSettings = false;
      this.authSetupState = null;
      this.showSettings();
      return;
    }

    // Re-add detail view components
    this.storyDetailState.panel.add(this.storyDetailState.header);
    this.storyDetailState.panel.add(this.storyDetailState.scroll);
    this.storyDetailState.panel.add(this.storyDetailState.shortcutsBar);

    // Re-render the current story with cached TLDR if available
    if (this.selectedPost) {
      const cachedTldr = this.tldrCache.get(this.selectedPost.id) || null;
      const hasError = this.tldrErrorIds.has(this.selectedPost.id);
      renderStoryDetail(this.ctx, this.storyDetailState, this.selectedPost, {
        onOpenStoryUrl: () => this.openStoryUrl(),
      }, {
        tldr: cachedTldr,
        isLoading: false,
        hasError,
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

    // Hide auth setup first
    this.authSetupFromSettings = false;
    this.hideAuthSetup();

    // Initialize chat service for the new provider
    this.chatServiceState = initChatServiceState(provider);

    // Handle based on what the user originally wanted to do
    if (this.settingsIntent === "chat") {
      this.showChatView();
    } else if (this.settingsIntent === "tldr") {
      // Go back to comments view and trigger TLDR
      this.handleTldrRequest();
    } else {
      // Intent was "settings" - go back to settings to show model picker
      this.showSettings();
    }

    // Reset intent
    this.settingsIntent = "settings";
  }

  private showSettings() {
    this.settingsMode = true;
    this.settingsFromChatMode = this.chatMode; // Remember where we came from
    this.settingsState = initSettingsState(this.ctx);

    // Cancel any pending loading interval
    this.cancelSuggestionLoadingInterval();

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

    // Remove existing components from detail panel
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    // Add settings components (header, scroll, shortcuts bar)
    this.storyDetailState.panel.add(this.settingsState.header);
    this.storyDetailState.panel.add(this.settingsState.scroll);
    this.storyDetailState.panel.add(this.settingsState.shortcutsBar);

    // Render settings content
    renderSettings(this.ctx, this.settingsState, getConfiguredProvider() || "anthropic");
    this.saveToCache();
  }

  private rerenderSettings() {
    if (!this.settingsState) return;

    // Just re-render the content (header, scroll, shortcuts already added)
    renderSettings(this.ctx, this.settingsState, getConfiguredProvider() || "anthropic");
  }

  private hideSettings() {
    this.settingsMode = false;

    // Remove settings components
    for (const child of this.storyDetailState.panel.getChildren()) {
      this.storyDetailState.panel.remove(child.id);
    }

    // Restore to the view we came from
    if (this.settingsFromChatMode && this.selectedPost && this.chatServiceState) {
      // Restore to chat view
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
      }

      // Render messages
      renderChatMessages(this.ctx, this.chatPanelState, this.chatServiceState.provider);

      // Restore or generate suggestions
      this.restoreSuggestionsFromSession(savedSession);
    } else {
      // Restore to comments view
      this.storyDetailState.panel.add(this.storyDetailState.header);
      this.storyDetailState.panel.add(this.storyDetailState.scroll);
      this.storyDetailState.panel.add(this.storyDetailState.shortcutsBar);

      // Re-render the current story with cached TLDR if available
      if (this.selectedPost) {
        const cachedTldr = this.tldrCache.get(this.selectedPost.id) || null;
        const hasError = this.tldrErrorIds.has(this.selectedPost.id);
        renderStoryDetail(this.ctx, this.storyDetailState, this.selectedPost, {
          onOpenStoryUrl: () => this.openStoryUrl(),
        }, {
          tldr: cachedTldr,
          isLoading: false,
          hasError,
        });
      }
    }

    this.settingsState = null;
    this.saveToCache();
  }

  private async refresh() {
    clearCache(); // Clear cache to force fresh fetch
    await this.loadPosts();
  }

  private async copySelectionToClipboard() {
    const selection = this.renderer.getSelection();
    if (!selection) return;

    const selectedText = selection.getSelectedText();
    if (!selectedText) return;

    // Determine clipboard command based on platform
    const platform = process.platform;
    let clipboardCmd: string[];

    if (platform === "darwin") {
      clipboardCmd = ["pbcopy"];
    } else if (platform === "linux") {
      // xclip is more commonly available; fall back to xsel
      clipboardCmd = ["xclip", "-selection", "clipboard"];
    } else if (platform === "win32") {
      clipboardCmd = ["clip"];
    } else {
      // Unsupported platform - silently fail
      return;
    }

    try {
      const proc = Bun.spawn(clipboardCmd, {
        stdin: "pipe",
      });
      proc.stdin.write(selectedText);
      proc.stdin.end();
      await proc.exited;
    } catch {
      // Clipboard command not available or failed - silently fail
    }
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

  private ensureLayoutReadyForTesting() {
    // Ensure main panels are added (they start hidden during loading state)
    const children = this.contentArea.getChildren();
    const hasStoryList = children.some(child => child.id === this.storyListState.panel.id);
    if (!hasStoryList) {
      this.contentArea.remove(this.emptyStateState.container.id);
      this.contentArea.add(this.storyListState.panel);
      this.contentArea.add(this.storyDetailState.panel);
    }

    // Ensure detail components (header, scroll, shortcuts) are shown
    const detailChildren = this.storyDetailState.panel.getChildren();
    const hasHeader = detailChildren.some(child => child.id === this.storyDetailState.header.id);
    if (!hasHeader) {
      showDetailComponents(this.storyDetailState);
    }
  }

  setPostsForTesting(posts: HackerNewsPost[]) {
    this.ensureLayoutReadyForTesting();
    this.posts = posts;
    renderStoryList(this.ctx, this.storyListState, this.posts, this.selectedIndex, {
      onSelect: (index) => this.selectStory(index),
    });
  }

  async setSelectedPostForTesting(post: HackerNewsPost) {
    this.ensureLayoutReadyForTesting();

    if (this.selectedIndex === -1) {
      this.selectedIndex = 0;
    }

    this.selectedPost = post;
    const cachedTldr = this.tldrCache.get(post.id) || null;
    const hasError = this.tldrErrorIds.has(post.id);
    renderStoryDetail(this.ctx, this.storyDetailState, post, {
      onOpenStoryUrl: () => this.openStoryUrl(),
    }, {
      tldr: cachedTldr,
      isLoading: false,
      hasError,
    });
  }

  /**
   * Cleanup method for tests - stops typing indicators and other intervals
   * that could cause crashes after renderer.destroy() is called.
   */
  cleanup() {
    if (this.chatPanelState) {
      stopTypingIndicator(this.chatPanelState);
    }
    this.stopTldrLoadingAnimation();
    this.stopAiIndicatorAnimation();
  }
}
