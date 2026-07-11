import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/ 與 dist/ 都在專案根目錄下一層，所以往上一層就是專案根目錄
export const PROJECT_ROOT = path.resolve(__dirname, "..");

// Playwright persistent context 的 userDataDir，登入 session 存在這裡
export const BROWSER_PROFILE_DIR = path.join(PROJECT_ROOT, "browser-profile");

export type Platform = "instagram" | "threads" | "facebook";

export const PLATFORM_URLS: Record<Platform, string> = {
  instagram: "https://www.instagram.com/",
  threads: "https://www.threads.com/",
  facebook: "https://www.facebook.com/",
};

// 頻率保險絲：避免 agent 失控輪詢觸發 Meta 風控
export const MIN_ACTION_INTERVAL_MS = 5_000; // 兩次瀏覽器操作之間的最小間隔
export const MAX_ACTIONS_PER_HOUR = 60; // 每小時操作上限

// 頁面載入後的緩衝時間，讓動態內容有機會 render
export const PAGE_SETTLE_MS = 3_000;
