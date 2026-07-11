import { PLATFORM_URLS } from "../config.js";
import { openPage } from "../browser/session.js";
import { collectFeed } from "./feed-collector.js";
import {
  parseFbFeedText,
  FB_PAGINATION_FRIENDLY_NAME,
  FB_SEARCH_PAGINATION_FRIENDLY_NAME,
  FB_PROFILE_PAGINATION_FRIENDLY_NAME,
  type RawFbPost,
} from "../extractors/facebook.js";
import type { FeedPost } from "./types.js";

function toFeedPost(raw: RawFbPost): FeedPost {
  return {
    platform: "facebook",
    author: raw.actor,
    text: raw.text || "（無文字內容，可能是純圖片/影片/連結貼文）",
    timestamp:
      raw.creationTime > 0
        ? new Date(raw.creationTime * 1000).toISOString()
        : undefined,
    likes: raw.reactionCount,
    url: raw.url || undefined,
  };
}

/** 讀取 FB 首頁動態牆（贊助貼文會被濾掉） */
export async function getFeed(count: number): Promise<FeedPost[]> {
  const posts = await collectFeed(
    {
      url: PLATFORM_URLS.facebook,
      matchesPagination: (name) => name === FB_PAGINATION_FRIENDLY_NAME,
      parseBody: parseFbFeedText,
      isFeedScript: (text) =>
        text.includes("comet_sections") && text.includes('"Story"'),
      keyOf: (p) => p.key,
    },
    count * 2, // 先多收一點，濾掉贊助貼文後才截到 count
  );

  const organic = posts.filter((p) => !p.sponsored);
  if (organic.length === 0) {
    throw new Error(
      "抓不到任何 feed 資料——FB 可能改版了，請檢查 src/extractors/facebook.ts",
    );
  }
  return organic.slice(0, count).map(toFeedPost);
}

/** 用關鍵字搜尋 FB 貼文（搜尋結果頁的「貼文」分頁，贊助內容一樣濾掉） */
export async function searchFbPosts(
  query: string,
  count: number,
): Promise<FeedPost[]> {
  const posts = await collectFeed(
    {
      url: `https://www.facebook.com/search/posts?q=${encodeURIComponent(query)}`,
      matchesPagination: (name) => name === FB_SEARCH_PAGINATION_FRIENDLY_NAME,
      parseBody: parseFbFeedText,
      isFeedScript: (text) =>
        text.includes("comet_sections") && text.includes('"Story"'),
      keyOf: (p) => p.key,
    },
    count * 2, // 同 getFeed：先多收，濾掉贊助後才截到 count
  );
  return posts
    .filter((p) => !p.sponsored)
    .slice(0, count)
    .map(toFeedPost);
}

/**
 * 把使用者輸入轉成 FB 個人頁網址。接受：
 * 自訂名稱（zuck）、數字 ID（4）、或整段網址（含 profile.php?id=… 形式）。
 */
function fbProfileUrl(input: string): string {
  const m = input.trim().match(/facebook\.com\/(.+?)\/?$/);
  const path = (m ? m[1] : input.trim()).replace(/^@/, "");
  if (/^\d+$/.test(path)) {
    return `https://www.facebook.com/profile.php?id=${path}`;
  }
  return `https://www.facebook.com/${path}`;
}

/**
 * 讀取特定使用者／粉專的 FB 時間軸貼文（含置頂與分享）。
 * 不濾 sponsored——個人時間軸上被標成贊助的是本人加強推廣的真實貼文。
 * 注意：非好友能看到的內容受對方隱私設定限制，抓到的可能比預期少。
 */
export async function getFbUserPosts(
  user: string,
  count: number,
): Promise<FeedPost[]> {
  const posts = await collectFeed(
    {
      url: fbProfileUrl(user),
      matchesPagination: (name) => name === FB_PROFILE_PAGINATION_FRIENDLY_NAME,
      parseBody: parseFbFeedText,
      isFeedScript: (text) =>
        text.includes("comet_sections") && text.includes('"Story"'),
      keyOf: (p) => p.key,
    },
    count,
  );

  if (posts.length === 0) {
    throw new Error(
      `抓不到「${user}」的任何貼文——帳號可能不存在、隱私設定擋住了、或還沒發過文。` +
        "請跟使用者確認帳號的自訂名稱或個人檔案網址；" +
        "若確定帳號公開且有貼文，可能是 FB 改版了。",
    );
  }
  return posts.map(toFeedPost);
}

// 貼文「動作」選單（zh-TW / en）。permalink 是 dialog 蓋在動態牆上，
// 頁面上會有兩個動作按鈕（背景 feed 也有一個），必須限定在 dialog 內找。
const FB_ACTIONS_SELECTOR =
  '[role="button"][aria-label*="動作"], [role="button"][aria-label*="Actions"]';
const FB_SAVE_ITEM = /儲存貼文|Save post/;
const FB_UNSAVE_ITEM = /取消儲存|從珍藏項目中移除|Unsave|Remove from/;
// 選單項目是 role=menu 底下的 role=button（不是 menuitem）
const FB_MENU_ITEM_SELECTOR = '[role="menu"] [role="button"]';

// permalink 的動作選單「儲存貼文」按下後會跳「儲存至」分類對話框，
// 要按「完成」才真正存檔。這是 FB 跟 IG/Threads 最大的差異。
const FB_SAVE_DIALOG_HEADING = /儲存至|Save to/;
const FB_DONE_BUTTON = /^(完成|Done)$/;

/**
 * 設定 FB 貼文的收藏狀態。回傳 'changed' 或 'already'。
 * 儲存：開動作選單 → 點「儲存貼文」→ 出現「儲存至」對話框 → 按「完成」。
 * 取消：動作選單「不」提供取消選項（永遠顯示「儲存貼文」），改到珍藏頁處理。
 */
export async function setFbBookmark(
  url: string,
  want: boolean,
): Promise<"changed" | "already"> {
  if (!want) return unsaveFromSavedPage(url);

  const page = await openPage(url);

  // permalink 是 dialog 蓋在動態牆上，背景 feed 也有動作鈕，
  // 限定在含動作鈕的 dialog 裡找；沒有 dialog 就用整頁
  const dialog = page.locator('[role="dialog"]').filter({
    has: page.locator(FB_ACTIONS_SELECTOR),
  });
  const hasDialog = await dialog
    .first()
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  const scope = hasDialog ? dialog.first() : page;

  const actionsBtn = scope.locator(FB_ACTIONS_SELECTOR).first();
  if (!(await actionsBtn.isVisible().catch(() => false))) {
    throw new Error(
      "找不到貼文的動作按鈕——貼文可能無法存取，或 FB 改版了（檢查 FB_ACTIONS_SELECTOR）",
    );
  }

  // FB dialog 上有透明 overlay 攔截滑鼠事件，動作鈕用 DOM click 繞過 hit-testing
  await actionsBtn.evaluate((el) => (el as HTMLElement).click());
  const menu = page.locator(FB_MENU_ITEM_SELECTOR);
  await menu.first().waitFor({ state: "visible", timeout: 8_000 });

  const saveItem = menu.filter({ hasText: FB_SAVE_ITEM }).first();
  if ((await saveItem.count()) === 0) {
    const items = await menu.allInnerTexts();
    throw new Error(
      `動作選單裡找不到「儲存貼文」——FB 可能改版了。實際項目：${items
        .slice(0, 10)
        .join(" / ")}`,
    );
  }

  // 選單彈層在最上層、沒有 overlay，用原生 click 派發 trusted 事件。
  // 注意：即使貼文已收藏，選單仍顯示「儲存貼文」，再點一次是無害的（會重開對話框）。
  await saveItem.click();

  // 「儲存至」對話框出現即代表儲存已生效；按「完成」確認分類
  const heading = page
    .locator('[role="dialog"]')
    .filter({ hasText: FB_SAVE_DIALOG_HEADING });
  await heading
    .first()
    .waitFor({ state: "visible", timeout: 8_000 })
    .catch(() => {
      throw new Error("點了儲存貼文但沒跳出「儲存至」對話框——FB 可能改版了");
    });
  const doneBtn = heading
    .locator('[role="button"]')
    .filter({ hasText: FB_DONE_BUTTON })
    .first();
  await doneBtn.click();
  await page.waitForTimeout(1_000);
  return "changed";
}

// 從貼文網址取出穩定的識別片段（pfbid、reel id、或純數字貼文 id）
function postIdFromUrl(url: string): string | null {
  const m =
    url.match(/pfbid[0-9A-Za-z]+/) ??
    url.match(/\/reel\/(\d+)/) ??
    url.match(/\/(?:posts|videos)\/(\d+)/);
  return m ? (m[1] ?? m[0]) : null;
}

/**
 * 取消收藏：動作選單沒有取消選項，改到珍藏頁用貼文 id 定位該項目 →
 * 開「更多珍藏項目選項」→ 點「取消儲存」。
 */
async function unsaveFromSavedPage(
  url: string,
): Promise<"changed" | "already"> {
  const postId = postIdFromUrl(url);
  if (!postId) {
    throw new Error(`無法從網址取出貼文 id，不支援取消收藏：${url}`);
  }

  const page = await openPage("https://www.facebook.com/saved");
  await page.waitForTimeout(2_000);

  // 找到指向這篇貼文的連結，往上找到它所屬的珍藏項目容器
  const link = page.locator(`a[href*="${postId}"]`).first();
  if ((await link.count()) === 0) {
    return "already"; // 珍藏頁沒有這篇 = 本來就沒收藏
  }
  const item = link.locator(
    'xpath=ancestor::*[.//div[@role="button" and contains(@aria-label,"珍藏項目選項")]][1]',
  );
  const optBtn = item
    .locator('[role="button"][aria-label*="珍藏項目選項"]')
    .first();
  await optBtn.evaluate((el) => (el as HTMLElement).click());

  const unsave = page
    .locator('[role="menu"] [role="button"], [role="menuitem"]')
    .filter({ hasText: /取消儲存|Unsave/ })
    .first();
  await unsave.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {
    throw new Error("珍藏項目選單裡找不到「取消儲存」——FB 可能改版了");
  });
  await unsave.click();
  await page.waitForTimeout(1_500);
  return "changed";
}
