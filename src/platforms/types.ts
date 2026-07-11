import type { Platform } from "../config.js";

export interface FeedPost {
  platform: Platform;
  author: string;
  text: string;
  timestamp?: string;
  likes?: number;
  url?: string;
}

export interface StoryEntry {
  username: string;
  fullName?: string;
  /** 是否還有沒看過的限動 */
  hasUnseen: boolean;
  /** 最新一則限動的時間（ISO 字串） */
  latestStoryAt?: string;
  /** 最新一則限動的過期時間（ISO 字串） */
  expiresAt?: string;
  muted?: boolean;
}

/**
 * 每個平台實作這個介面。selector 與 DOM 解析請放在 src/extractors/，
 * adapter 只負責流程（開頁、捲動、等待）。
 */
export interface PlatformAdapter {
  platform: Platform;
  isLoggedIn(): Promise<boolean>;
  getFeed(count: number): Promise<FeedPost[]>;
  searchPosts?(query: string, count: number): Promise<FeedPost[]>;
  getUserPosts?(user: string, count: number): Promise<FeedPost[]>;
  getActiveStories?(): Promise<StoryEntry[]>;
  bookmarkPost?(url: string): Promise<void>;
}
