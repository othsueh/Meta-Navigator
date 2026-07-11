import { chromium, type BrowserContext, type Page } from "playwright";
import {
  BROWSER_PROFILE_DIR,
  MIN_ACTION_INTERVAL_MS,
  MAX_ACTIONS_PER_HOUR,
  PAGE_SETTLE_MS,
} from "../config.js";

let context: BrowserContext | null = null;
let contextIsHeaded = false;

const actionTimestamps: number[] = [];

/**
 * 頻率保險絲：兩次操作間隔至少 MIN_ACTION_INTERVAL_MS，
 * 且滾動一小時內不超過 MAX_ACTIONS_PER_HOUR 次。
 * 超過小時上限時直接丟錯誤（而不是排隊等待），讓 agent 知道該停手。
 */
async function throttle(): Promise<void> {
  const now = Date.now();

  const oneHourAgo = now - 60 * 60 * 1000;
  while (actionTimestamps.length > 0 && actionTimestamps[0] < oneHourAgo) {
    actionTimestamps.shift();
  }
  if (actionTimestamps.length >= MAX_ACTIONS_PER_HOUR) {
    throw new Error(
      `已達每小時 ${MAX_ACTIONS_PER_HOUR} 次操作上限，為了帳號安全請稍後再試`,
    );
  }

  const last = actionTimestamps[actionTimestamps.length - 1];
  if (last !== undefined) {
    const wait = last + MIN_ACTION_INTERVAL_MS - now;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  actionTimestamps.push(Date.now());
}

/**
 * 取得（或建立）persistent browser context。
 * 同一個 userDataDir 同時只能有一個 context，切換 headed/headless 時會重開。
 */
export async function getContext(
  opts: { headed?: boolean } = {},
): Promise<BrowserContext> {
  const headed = opts.headed ?? false;

  if (context && contextIsHeaded !== headed) {
    await context.close();
    context = null;
  }

  if (!context) {
    context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      headless: !headed,
      viewport: { width: 1280, height: 900 },
      locale: "zh-TW",
    });
    contextIsHeaded = headed;
    context.on("close", () => {
      context = null;
    });
  }

  return context;
}

/**
 * 取得分頁但不導航——給需要在 goto 前掛 response listener 的流程
 * （例如搜尋頁的第一批結果是載入期間的 XHR，載入完才掛就漏掉了）。
 * 一樣經過頻率保險絲。
 */
export async function preparePage(
  opts: { headed?: boolean } = {},
): Promise<Page> {
  await throttle();
  const ctx = await getContext(opts);

  // 重用第一個分頁，避免分頁越開越多
  return ctx.pages()[0] ?? (await ctx.newPage());
}

/** 導航到指定 URL 並等待頁面穩定 */
export async function navigateAndSettle(
  page: Page,
  url: string,
): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(PAGE_SETTLE_MS);
}

/**
 * 開啟指定 URL 並等待頁面穩定。所有工具都應該透過這個函式拿 Page，
 * 才會經過頻率保險絲。
 */
export async function openPage(
  url: string,
  opts: { headed?: boolean } = {},
): Promise<Page> {
  const page = await preparePage(opts);
  await navigateAndSettle(page, url);
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
}
