import { PLATFORM_URLS } from "../config.js";
import { openPage } from "../browser/session.js";
import { collectFeed } from "./feed-collector.js";
import {
  parseThreadsFeedText,
  isThreadsFeedScript,
  isThreadsSearchScript,
  isThreadsProfileScript,
  THREADS_PAGINATION_FRIENDLY_NAME,
  THREADS_SEARCH_PAGINATION_FRIENDLY_NAME,
  THREADS_PROFILE_PAGINATION_FRIENDLY_NAME,
  type RawThreadsPost,
} from "../extractors/threads.js";
import type { FeedPost } from "./types.js";

function toFeedPost(raw: RawThreadsPost): FeedPost {
  return {
    platform: "threads",
    author: raw.fullName ? `${raw.username}（${raw.fullName}）` : raw.username,
    text: raw.text || (raw.hasMedia ? "（純圖片/影片貼文，無文字）" : ""),
    timestamp:
      raw.takenAt > 0 ? new Date(raw.takenAt * 1000).toISOString() : undefined,
    likes: raw.likeCount,
    url: raw.code
      ? `https://www.threads.com/@${raw.username}/post/${raw.code}`
      : undefined,
  };
}

/** 讀取 Threads 首頁 feed（「為你推薦」演算法時間軸） */
export async function getFeed(count: number): Promise<FeedPost[]> {
  const posts = await collectFeed(
    {
      url: PLATFORM_URLS.threads,
      matchesPagination: (name) => name === THREADS_PAGINATION_FRIENDLY_NAME,
      parseBody: parseThreadsFeedText,
      isFeedScript: isThreadsFeedScript,
      keyOf: (p) => p.pk,
    },
    count,
  );

  if (posts.length === 0) {
    throw new Error(
      "抓不到任何 feed 資料——Threads 可能改版了，請檢查 src/extractors/threads.ts",
    );
  }
  return posts.map(toFeedPost);
}

/** 用關鍵字搜尋 Threads 貼文（serp_type=default 是「熱門」排序） */
export async function searchThreadsPosts(
  query: string,
  count: number,
): Promise<FeedPost[]> {
  const posts = await collectFeed(
    {
      url: `https://www.threads.com/search?q=${encodeURIComponent(query)}&serp_type=default`,
      matchesPagination: (name) =>
        name === THREADS_SEARCH_PAGINATION_FRIENDLY_NAME,
      parseBody: parseThreadsFeedText,
      isFeedScript: isThreadsSearchScript,
      keyOf: (p) => p.pk,
    },
    count,
  );
  return posts.map(toFeedPost);
}

/** 從 handle 或個人頁網址取出乾淨的 username（去掉網域、@、多餘路徑） */
function normalizeThreadsUser(input: string): string {
  const m = input.match(/threads\.(?:com|net)\/@?([^/?#]+)/);
  return (m ? m[1] : input.trim()).replace(/^@/, "");
}

/** 讀取特定使用者的 Threads 個人頁貼文（串文分頁，含置頂與轉發） */
export async function getThreadsUserPosts(
  user: string,
  count: number,
): Promise<FeedPost[]> {
  const username = normalizeThreadsUser(user);
  const posts = await collectFeed(
    {
      url: `https://www.threads.com/@${encodeURIComponent(username)}`,
      matchesPagination: (name) =>
        name === THREADS_PROFILE_PAGINATION_FRIENDLY_NAME,
      parseBody: parseThreadsFeedText,
      isFeedScript: isThreadsProfileScript,
      keyOf: (p) => p.pk,
    },
    count,
  );

  if (posts.length === 0) {
    throw new Error(
      `抓不到 @${username} 的任何貼文——帳號可能不存在、是私人帳號、或還沒發過文。` +
        "請跟使用者確認帳號名；若確定帳號公開且有貼文，可能是 Threads 改版了。",
    );
  }
  return posts.map(toFeedPost);
}

// 主貼文「更多」選單的項目文字（zh-TW / en）
const MORE_LABELS = ["更多", "More"];
const SAVE_ITEM = /^(儲存|Save)$/;
const UNSAVE_ITEM = /^(取消儲存|Unsave)$/;

/**
 * 設定 Threads 貼文的收藏狀態。回傳 'changed' 或 'already'。
 * 流程：開主貼文的「更多」選單 → 點「儲存/取消儲存」→ 重開選單驗證。
 */
export async function setThreadsBookmark(
  url: string,
  want: boolean,
): Promise<"changed" | "already"> {
  const page = await openPage(url);

  // 主貼文 = 第一個 pressable container（後面的是回覆）
  const mainPost = page.locator('div[data-pressable-container="true"]').first();
  const moreBtn = mainPost
    .locator(MORE_LABELS.map((l) => `svg[aria-label="${l}"]`).join(", "))
    .first();

  const openMenu = async () => {
    await moreBtn.click();
    const menu = page.locator(
      '[role="menuitem"], [role="menu"] [role="button"]',
    );
    await menu.first().waitFor({ state: "visible", timeout: 8_000 });
    return menu;
  };

  let menu = await openMenu();
  const saveItem = menu.filter({ hasText: SAVE_ITEM }).first();
  const unsaveItem = menu.filter({ hasText: UNSAVE_ITEM }).first();

  const isSaved = (await unsaveItem.count()) > 0;
  const canSave = (await saveItem.count()) > 0;
  if (!isSaved && !canSave) {
    const items = await menu.allInnerTexts();
    throw new Error(
      `選單裡找不到儲存項目——Threads 可能改版了。實際項目：${items.join(" / ")}`,
    );
  }
  if (isSaved === want) {
    await page.keyboard.press("Escape");
    return "already";
  }

  await (want ? saveItem : unsaveItem).click();
  await page.waitForTimeout(1_500);

  // 重開選單驗證狀態真的變了
  menu = await openMenu();
  const verified =
    (await menu.filter({ hasText: want ? UNSAVE_ITEM : SAVE_ITEM }).count()) >
    0;
  await page.keyboard.press("Escape");
  if (!verified) {
    throw new Error("點了儲存但選單狀態沒有改變——Threads 可能改版了");
  }
  return "changed";
}
