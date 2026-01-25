import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  type RenderContext,
} from "@opentui/core";
import { getRankedPosts, getPostById } from "./api";
import type { HackerNewsPost, HackerNewsComment } from "./types";

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
  private selectedIndex = 0;
  private selectedPost: HackerNewsPost | null = null;
  private rootCommentIndex = 0;

  private storyListScroll!: ScrollBoxRenderable;
  private storyItems: Map<number, BoxRenderable> = new Map();
  private detailScroll!: ScrollBoxRenderable;
  private detailContent!: BoxRenderable;
  private rootCommentBoxes: BoxRenderable[] = [];

  // Loading state
  private loadingIndicator: TextRenderable | null = null;
  private loadingInterval: ReturnType<typeof setInterval> | null = null;
  private loadingFrame = 0;
  private static readonly LOADING_CHARS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

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
      if (palette.defaultBackground && isLightBackground(palette.defaultBackground)) {
        COLORS = { ...LIGHT_THEME };
      }
    } catch {
      // If detection fails, keep dark theme (default)
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
      content: "briOS HN",
      fg: COLORS.accent,
    });
    header.add(title);

    // Loading indicator (hidden initially by being empty)
    this.loadingIndicator = new TextRenderable(this.ctx, {
      content: "",
      fg: COLORS.textDim,
    });
    header.add(this.loadingIndicator);

    return header;
  }

  private startLoadingAnimation() {
    if (this.loadingInterval) return;

    this.loadingFrame = 0;
    this.loadingInterval = setInterval(() => {
      if (this.loadingIndicator && !this.renderer.isDestroyed) {
        const char = HackerNewsApp.LOADING_CHARS[this.loadingFrame] ?? "⠋";
        this.loadingIndicator.content = char;
        this.loadingFrame = (this.loadingFrame + 1) % HackerNewsApp.LOADING_CHARS.length;
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
    const content = new BoxRenderable(this.ctx, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "row",
    });

    const leftPanel = this.createStoryList();
    const rightPanel = this.createDetailPanel();

    content.add(leftPanel);
    content.add(rightPanel);

    return content;
  }

  private createStoryList(): BoxRenderable {
    const panel = new BoxRenderable(this.ctx, {
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

    panel.add(this.storyListScroll);

    return panel;
  }

  private createDetailPanel(): BoxRenderable {
    const panel = new BoxRenderable(this.ctx, {
      width: "65%",
      height: "100%",
      flexDirection: "column",
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
    panel.add(this.detailScroll);

    // Keyboard shortcuts bar at bottom
    const shortcutsBar = this.createShortcutsBar();
    panel.add(shortcutsBar);

    return panel;
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
      { key: "o", desc: "open url" },
      { key: "⌘o", desc: "view on briOS" },
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

      // Check for cmd/meta modifier
      const hasCmdMod = key.meta;

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
      else if (key.name === "o" && !hasCmdMod) {
        this.openStoryUrl();
      }
      // Open on briOS: cmd+o
      else if (key.name === "o" && hasCmdMod) {
        this.openOnHN();
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
      if (this.posts.length > 0) {
        await this.selectStory(0);
      }
    } catch (error) {
      this.stopLoadingAnimation();
      console.error("Error loading posts:", error);
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

    // Dot indicator column
    const dotIndicator = new TextRenderable(this.ctx, {
      id: `dot-${post.id}`,
      content: isSelected ? "●" : "•",
      fg: isSelected ? COLORS.accent : COLORS.textVeryDim,
      width: 2,
      paddingLeft: 1,
    });
    item.add(dotIndicator);

    // Content area
    const content = new BoxRenderable(this.ctx, {
      id: `content-${post.id}`,
      flexGrow: 1,
      flexDirection: "column",
      paddingRight: 1,
    });
    item.add(content);

    // Title (truncated to ~2 lines worth of characters)
    const maxTitleLength = 80;
    const titleText = new TextRenderable(this.ctx, {
      id: `title-${post.id}`,
      content: this.truncateText(post.title, maxTitleLength),
      fg: isSelected ? COLORS.accent : COLORS.text,
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
      console.error("Error loading post:", error);
    }

    if (this.renderer.isDestroyed) return;

    // Scroll story list to keep selected item visible
    // Items are more compact now (title + domain on same line)
    const itemHeight = 2; // Title line(s) - may wrap to 2 lines
    const scrollTop = Math.max(0, index * itemHeight - 5);
    this.storyListScroll.scrollTop = scrollTop;
  }

  private updateStoryItemStyle(index: number, isSelected: boolean) {
    const item = this.storyItems.get(index);
    if (!item) return;

    const post = this.posts[index];
    if (!post) return;

    const children = item.getChildren();
    // children[0] = dot indicator, children[1] = content box
    if (children.length >= 2) {
      // Update dot indicator
      const dotIndicator = children[0] as TextRenderable;
      if (dotIndicator && "content" in dotIndicator) {
        dotIndicator.content = isSelected ? "●" : "•";
        (dotIndicator as any).fg = isSelected ? COLORS.accent : COLORS.textVeryDim;
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
    // Clear existing content
    for (const child of this.detailContent.getChildren()) {
      this.detailContent.remove(child.id);
    }
    this.rootCommentBoxes = [];

    // Create unified header container
    const headerContainer = new BoxRenderable(this.ctx, {
      width: "100%",
      flexDirection: "column",
      paddingBottom: 1,
      marginBottom: 1,
      borderStyle: "single",
      border: ["bottom"],
      borderColor: COLORS.border,
      backgroundColor: COLORS.bg,
    });

    // Title (clickable, with word wrap for long titles)
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
    headerContainer.add(titleText);

    // URL (clickable, lighter gray to match sidebar)
    if (post.domain) {
      const urlText = new TextRenderable(this.ctx, {
        content: post.domain,
        fg: COLORS.textDim,
        onMouseDown: () => this.openStoryUrl(),
      });
      headerContainer.add(urlText);
    }

    this.detailContent.add(headerContainer);

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

  private renderComment(comment: HackerNewsComment, rootIndex?: number): BoxRenderable {
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
      marginTop: isRootComment ? 2 : 1,
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
    const url = this.selectedPost.url || `https://news.ycombinator.com/item?id=${this.selectedPost.id}`;
    this.callbacks.onOpenUrl?.(url);
  }

  private openOnHN() {
    if (!this.selectedPost) return;
    const url = `${HN_BASE_URL}/${this.selectedPost.id}`;
    this.callbacks.onOpenUrl?.(url);
  }

  private async refresh() {
    await this.loadPosts();
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  private stripHtml(html: string): string {
    return html
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
      .trim();
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
