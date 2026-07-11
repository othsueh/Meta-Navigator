import { parseJsonLines } from "./json-utils.js";

/**
 * Threads 首頁把第一批 feed 資料內嵌在 script[type="application/json"]
 * （特徵 key: feedData + thread_items），捲動後的分頁走 GraphQL XHR
 * （friendly name: BarcelonaFeedPaginationDirectQuery），兩者的 payload
 * 結構相同，都用 parseThreadsFeedText 解析。Threads 改版時優先檢查這些特徵。
 */
export interface RawThreadsPost {
  pk: string;
  username: string;
  fullName: string | null;
  text: string;
  takenAt: number; // epoch 秒
  likeCount: number;
  code: string; // 貼文網址代碼：threads.com/@{username}/post/{code}
  hasMedia: boolean;
}

export const THREADS_PAGINATION_FRIENDLY_NAME =
  "BarcelonaFeedPaginationDirectQuery";

export function isThreadsFeedScript(text: string): boolean {
  return text.includes("thread_items") && text.includes("feedData");
}

/**
 * Threads 搜尋頁（/search?q=...）的 payload 與 feed 同為 thread_items，
 * 差別只在內嵌 script 的特徵 key 是 searchResults、分頁 friendly name 不同，
 * 解析一律共用 parseThreadsFeedText。
 */
export const THREADS_SEARCH_PAGINATION_FRIENDLY_NAME =
  "BarcelonaSearchResultsRefetchableQuery";

export function isThreadsSearchScript(text: string): boolean {
  return text.includes("thread_items") && text.includes("searchResults");
}

/**
 * Threads 個人頁（/@{username}）：內嵌 script 的特徵 key 是
 * mediaData（結構 data.mediaData.edges[].node.thread_items），
 * 分頁 friendly name 不同，payload 一樣用 parseThreadsFeedText 解析。
 */
export const THREADS_PROFILE_PAGINATION_FRIENDLY_NAME =
  "BarcelonaProfileThreadsTabRefetchableDirectQuery";

export function isThreadsProfileScript(text: string): boolean {
  return text.includes("thread_items") && text.includes("mediaData");
}

export function parseThreadsFeedText(text: string): RawThreadsPost[] {
  if (!text.includes("thread_items")) return [];
  return parseJsonLines(text).flatMap(parseThreadsFeedJson);
}

/** 深度收集 JSON 裡所有 thread_items 陣列，攤平成貼文列表 */
function parseThreadsFeedJson(root: unknown): RawThreadsPost[] {
  const itemArrays: unknown[][] = [];

  function collect(node: unknown): void {
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.thread_items)) {
      itemArrays.push(obj.thread_items as unknown[]);
    }
    for (const value of Object.values(obj)) collect(value);
  }
  collect(root);

  const posts: RawThreadsPost[] = [];
  for (const items of itemArrays) {
    for (const item of items) {
      const post = (item as { post?: Record<string, unknown> }).post;
      if (!post) continue;

      const user = post.user as
        { username?: string; full_name?: string } | undefined;
      const caption = post.caption as { text?: string } | null | undefined;
      if (!user?.username || typeof post.pk !== "string") continue;

      posts.push({
        pk: post.pk,
        username: user.username,
        fullName: user.full_name ?? null,
        text: caption?.text ?? "",
        takenAt: typeof post.taken_at === "number" ? post.taken_at : 0,
        likeCount: typeof post.like_count === "number" ? post.like_count : 0,
        code: typeof post.code === "string" ? post.code : "",
        hasMedia:
          post.image_versions2 != null ||
          post.video_versions != null ||
          post.carousel_media != null,
      });
    }
  }
  return posts;
}
