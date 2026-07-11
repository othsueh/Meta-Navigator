import type { Page } from "playwright";
import { PLATFORM_URLS } from "../config.js";
import { openPage } from "../browser/session.js";
import {
  extractReelsTray,
  parseIgFeedText,
  parseIgSearchText,
  parseIgUserTimelineText,
  IG_FEED_CONNECTION_KEY,
  IG_FEED_PAGINATION_PREFIX,
  IG_SEARCH_SERP_KEY,
  IG_SEARCH_PAGINATION_SUBSTR,
  IG_USER_TIMELINE_KEY,
  IG_PROFILE_PAGINATION_PREFIX,
  type RawIgFeedPost,
} from "../extractors/instagram.js";
import { collectFeed } from "./feed-collector.js";
import type { StoryEntry, FeedPost } from "./types.js";

function toIso(epochSeconds: number): string | undefined {
  return epochSeconds > 0
    ? new Date(epochSeconds * 1000).toISOString()
    : undefined;
}

/**
 * 列出目前有發限動的帳號。只讀首頁內嵌的 tray 資料，
 * 不會點開限動，不會產生已讀。
 */
export async function getActiveStories(): Promise<StoryEntry[]> {
  const page = await openPage(PLATFORM_URLS.instagram);
  const tray = await extractReelsTray(page);

  if (tray.length === 0) {
    // 分不清「真的沒人發限動」跟「IG 改版導致抓不到資料」，
    // 用登入 cookie 之外的訊號輔助判斷：頁面上有沒有 canvas（限動圈）
    const canvasCount = await page.locator("canvas").count();
    if (canvasCount > 1) {
      throw new Error(
        "頁面上看得到限動圈，但抓不到 tray 資料——IG 可能改版了，請檢查 src/extractors/instagram.ts",
      );
    }
  }

  return tray.map((e) => ({
    username: e.username,
    fullName: e.fullName ?? undefined,
    hasUnseen: e.latestReelMedia > e.seen,
    latestStoryAt: toIso(e.latestReelMedia),
    expiresAt: toIso(e.expiringAt),
    muted: e.muted,
  }));
}

function toIgFeedPost(raw: RawIgFeedPost): FeedPost {
  return {
    platform: "instagram" as const,
    author: raw.fullName ? `${raw.username}（${raw.fullName}）` : raw.username,
    text: raw.text || "（無文字說明的貼文）",
    timestamp:
      raw.takenAt > 0 ? new Date(raw.takenAt * 1000).toISOString() : undefined,
    likes: raw.likeCount,
    url: raw.code
      ? `https://www.instagram.com/${raw.productType === "clips" ? "reel" : "p"}/${raw.code}/`
      : undefined,
  };
}

/** 讀取 IG 首頁 feed（你追蹤的帳號＋演算法推薦，已濾掉廣告單元） */
export async function getIgFeed(count: number): Promise<FeedPost[]> {
  const posts = await collectFeed(
    {
      url: PLATFORM_URLS.instagram,
      matchesPagination: (name) => name.startsWith(IG_FEED_PAGINATION_PREFIX),
      parseBody: parseIgFeedText,
      isFeedScript: (text) => text.includes(IG_FEED_CONNECTION_KEY),
      keyOf: (p) => p.pk,
    },
    count,
  );

  if (posts.length === 0) {
    throw new Error(
      "抓不到任何 feed 資料——IG 可能改版了，請檢查 src/extractors/instagram.ts",
    );
  }

  return posts.map(toIgFeedPost);
}

/** 用關鍵字搜尋 IG 貼文（explore 關鍵字搜尋的貼文格結果） */
export async function searchIgPosts(
  query: string,
  count: number,
): Promise<FeedPost[]> {
  const posts = await collectFeed(
    {
      url: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`,
      matchesPagination: (name) => name.includes(IG_SEARCH_PAGINATION_SUBSTR),
      parseBody: parseIgSearchText,
      // 結果不內嵌在 HTML，這裡只是保險（內嵌了也解析得動）
      isFeedScript: (text) => text.includes(IG_SEARCH_SERP_KEY),
      keyOf: (p) => p.pk,
    },
    count,
  );
  return posts.map(toIgFeedPost);
}

/** 從 handle 或個人頁網址取出乾淨的 username */
function normalizeIgUser(input: string): string {
  const m = input.match(/instagram\.com\/@?([^/?#]+)/);
  return (m ? m[1] : input.trim()).replace(/^@/, "");
}

/** 讀取特定使用者的 IG 個人頁貼文（貼文格時間軸，新到舊） */
export async function getIgUserPosts(
  user: string,
  count: number,
): Promise<FeedPost[]> {
  const username = normalizeIgUser(user);
  const posts = await collectFeed(
    {
      url: `https://www.instagram.com/${encodeURIComponent(username)}/`,
      matchesPagination: (name) =>
        name.startsWith(IG_PROFILE_PAGINATION_PREFIX),
      parseBody: parseIgUserTimelineText,
      // 首批走載入期 XHR，不內嵌在 HTML；這裡只是保險
      isFeedScript: (text) => text.includes(IG_USER_TIMELINE_KEY),
      // pk 是會掉精度的大數字，改用貼文網址代碼去重
      keyOf: (p) => p.code || p.pk,
    },
    count,
  );

  if (posts.length === 0) {
    throw new Error(
      `抓不到 ${username} 的任何貼文——帳號可能不存在、是私人帳號、或還沒發過文。` +
        "請跟使用者確認帳號名；若確定帳號公開且有貼文，可能是 IG 改版了。",
    );
  }
  return posts.map(toIgFeedPost);
}

// 貼文頁動作列的收藏按鈕 aria-label（zh-TW / en）
const IG_SAVE_LABELS = ["儲存", "Save"];
const IG_UNSAVE_LABELS = ["移除", "Remove"];

const svgSelector = (labels: string[]) =>
  labels.map((l) => `svg[aria-label="${l}"]`).join(", ");

/** 從貼文頁內嵌 JSON 讀 has_viewer_saved（載入即有，不必等 hydration，
 * 比按鈕 aria-label 可靠——後者在 hydration 完成前會顯示過時狀態） */
async function readViewerSaved(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    (globalThis as { __name?: unknown }).__name ??= (fn: unknown) => fn;
    for (const s of document.querySelectorAll(
      'script[type="application/json"]',
    )) {
      const m = (s.textContent ?? "").match(/"has_viewer_saved":(true|false)/);
      if (m) return m[1] === "true";
    }
    return null;
  });
}

/**
 * 設定 IG 貼文的珍藏狀態。回傳 'changed' 或 'already'（本來就是目標狀態）。
 * 用內嵌的 has_viewer_saved 判斷目前狀態，再點動作列的儲存鈕，點完以 aria-label 驗證。
 */
export async function setIgBookmark(
  url: string,
  want: boolean,
): Promise<"changed" | "already"> {
  const page = await openPage(url);

  const saveBtn = page.locator(svgSelector(IG_SAVE_LABELS)).first();
  const unsaveBtn = page.locator(svgSelector(IG_UNSAVE_LABELS)).first();

  const anyBtn = page
    .locator(`${svgSelector(IG_SAVE_LABELS)}, ${svgSelector(IG_UNSAVE_LABELS)}`)
    .first();
  await anyBtn.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
    throw new Error(
      "找不到儲存按鈕——貼文可能無法存取，或 IG 改版了（檢查 IG_SAVE_LABELS）",
    );
  });

  // 優先用內嵌旗標判斷狀態；讀不到才退回按鈕（等 hydration 後）
  let isSaved = await readViewerSaved(page);
  if (isSaved === null) {
    await page.waitForTimeout(2_500);
    isSaved = await unsaveBtn.isVisible().catch(() => false);
  }
  if (isSaved === want) return "already";

  // 等按鈕 hydration 到「目前狀態」的那顆再點，避免點到過時的反向按鈕
  const currentBtn = isSaved ? unsaveBtn : saveBtn;
  await currentBtn.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
    throw new Error("儲存按鈕狀態與內嵌資料不一致——IG 可能改版了");
  });

  // click svg 本體即可，事件會冒泡到外層的 role=button
  await currentBtn.click();

  const expected = want ? unsaveBtn : saveBtn;
  await expected.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {
    throw new Error("點了儲存按鈕但狀態沒有改變——IG 可能改版了");
  });
  return "changed";
}
