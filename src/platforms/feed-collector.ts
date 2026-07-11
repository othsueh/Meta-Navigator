import type { Page, Response } from "playwright";
import { preparePage, navigateAndSettle } from "../browser/session.js";

/**
 * 三個平台的 feed 抓取流程相同：
 * 1. 開首頁，解析內嵌 JSON 拿第一批貼文
 * 2. 捲動觸發 lazy load，攔截分頁 GraphQL 回應（同一個 parser 解析）
 * 3. 以 key 去重，湊滿 count 或捲到上限為止
 * 平台差異全部收在 FeedSource 裡。
 */
export interface FeedSource<T> {
  url: string;
  /** 分頁 GraphQL 的 friendly name 是否屬於這個 feed */
  matchesPagination(friendlyName: string): boolean;
  /** 解析內嵌 script 或 XHR body（可能是多行 JSON stream） */
  parseBody(text: string): T[];
  /** 挑出可能含 feed 資料的內嵌 script 原文 */
  isFeedScript(text: string): boolean;
  keyOf(item: T): string;
}

const MAX_SCROLLS = 8;
const SCROLL_WAIT_MS = 2_500;

export function getFriendlyName(res: Response): string {
  return (
    res.request().headers()["x-fb-friendly-name"] ??
    new URLSearchParams(res.request().postData() ?? "").get(
      "fb_api_req_friendly_name",
    ) ??
    ""
  );
}

/** 把可能是多行 JSON stream 的 body 逐行 parse（FB 用這種格式） */
export function parseJsonLines(text: string): unknown[] {
  const docs: unknown[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      docs.push(JSON.parse(trimmed));
    } catch {
      // 不是完整 JSON 的行直接略過
    }
  }
  // 整段是單一 JSON 但含換行的情況
  if (docs.length === 0) {
    try {
      docs.push(JSON.parse(text));
    } catch {
      /* ignore */
    }
  }
  return docs;
}

export async function collectFeed<T>(
  source: FeedSource<T>,
  count: number,
): Promise<T[]> {
  const page: Page = await preparePage();

  const byKey = new Map<string, T>();
  const addAll = (items: T[]) => {
    for (const item of items) {
      const key = source.keyOf(item);
      if (!byKey.has(key)) byKey.set(key, item);
    }
  };

  // 導航前就掛 listener：有些頁面（IG 搜尋）的第一批結果是載入期間的
  // GraphQL XHR，不會內嵌在 HTML，載入完才掛就漏掉了
  const pendingBodies: Promise<void>[] = [];
  const onResponse = (res: Response) => {
    if (!res.url().includes("/graphql")) return;
    if (!source.matchesPagination(getFriendlyName(res))) return;
    pendingBodies.push(
      res
        .text()
        .then((body) => addAll(source.parseBody(body)))
        .catch(() => {}), // body 可能已不可用，略過
    );
  };
  page.on("response", onResponse);

  try {
    await navigateAndSettle(page, source.url);
    const embedded = await page.evaluate(() => {
      // tsx(esbuild) 的 __name 注入問題，見 extractors/instagram.ts
      (globalThis as { __name?: unknown }).__name ??= (fn: unknown) => fn;
      return Array.from(
        document.querySelectorAll('script[type="application/json"]'),
      ).map((s) => s.textContent ?? "");
    });
    for (const text of embedded) {
      if (source.isFeedScript(text)) addAll(source.parseBody(text));
    }

    for (let i = 0; i < MAX_SCROLLS && byKey.size < count; i++) {
      // 分幾次滾比一次滾到底更接近真人，也比較能觸發 lazy load
      for (let j = 0; j < 3; j++) {
        await page.mouse.wheel(0, 3_000);
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(SCROLL_WAIT_MS);
      await Promise.all(pendingBodies.splice(0));
    }
    await Promise.all(pendingBodies.splice(0));
  } finally {
    page.off("response", onResponse);
  }

  return Array.from(byKey.values()).slice(0, count);
}
