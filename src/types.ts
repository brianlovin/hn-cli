export type HackerNewsPostType = "link" | "comment" | "job" | "poll" | "story";

/**
 * Keyboard event structure from OpenTUI
 */
export interface KeyEvent {
  name?: string;
  shift?: boolean;
  super?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

export interface HackerNewsComment {
  id: number | string;
  user: string | null;
  content: string | null;
  level: number;
  comments: HackerNewsComment[];
  comments_count?: number | null;
  time?: number | null;
  time_ago?: string | null;
  dead?: boolean;
  deleted?: boolean;
}

export interface HackerNewsPost {
  id: number;
  title: string;
  points: number | null;
  user: string | null;
  time: number;
  time_ago: string;
  type: HackerNewsPostType;
  content: string | null;
  url: string;
  domain: string | null;
  comments: HackerNewsComment[];
  comments_count: number;
}
