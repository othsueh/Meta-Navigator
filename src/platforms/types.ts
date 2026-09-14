import type { Platform } from "../config.js";

export interface FeedPost {
  platform: Platform;
  author: string;
  text: string;
  timestamp?: string;
  likes?: number;
  url?: string;
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
  bookmarkPost?(url: string): Promise<void>;
}
