import { deepFind, parseJsonLines } from "./json-utils.js";

/**
 * IG 首頁 feed：內嵌 JSON 與分頁 XHR（friendly name 以
 * PolarisFeedRootPagination 開頭）都是同一結構：
 * xdt_api__v1__feed__timeline__connection.edges[].node.media
 * （media 為 null 的 edge 是廣告或推薦單元，跳過）。
 */
export interface RawIgFeedPost {
  pk: string;
  username: string;
  fullName: string | null;
  text: string;
  takenAt: number; // epoch 秒
  likeCount: number;
  code: string;
  productType: string; // 'feed' | 'clips'（Reels）...
}

export const IG_FEED_CONNECTION_KEY = "xdt_api__v1__feed__timeline__connection";
export const IG_FEED_PAGINATION_PREFIX = "PolarisFeedRootPagination";

/**
 * IG 關鍵字搜尋（explore/search/keyword/?q=...）：結果不內嵌在 HTML，
 * 全部走 GraphQL XHR（friendly name 含 PolarisKeywordSearch），
 * 結構是 xdt_fbsearch__top_serp_graphql.edges[].node，其中
 * XDTTopSerpMediaGridUnit 的 items[] 是與 feed media 同形的 XDTMediaDict
 * （沒有 product_type，但 /p/{code}/ 對 Reels 也通用）。
 */
export const IG_SEARCH_SERP_KEY = "xdt_fbsearch__top_serp_graphql";
export const IG_SEARCH_PAGINATION_SUBSTR = "PolarisKeywordSearch";

export function parseIgSearchText(text: string): RawIgFeedPost[] {
  if (!text.includes(IG_SEARCH_SERP_KEY)) return [];

  const posts: RawIgFeedPost[] = [];
  for (const doc of parseJsonLines(text)) {
    const serp = deepFind(doc, IG_SEARCH_SERP_KEY) as
      { edges?: unknown[] } | undefined;
    if (!serp?.edges) continue;

    for (const edge of serp.edges) {
      const items = (edge as { node?: { items?: unknown[] } }).node?.items;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const media = item as Record<string, unknown>;
        const user = media.user as
          { username?: string; full_name?: string } | undefined;
        const caption = media.caption as { text?: string } | null | undefined;
        const pk =
          typeof media.pk === "string" ? media.pk : String(media.id ?? "");
        if (!user?.username || !pk) continue;

        posts.push({
          pk,
          username: user.username,
          fullName: user.full_name ?? null,
          text: caption?.text ?? "",
          takenAt: typeof media.taken_at === "number" ? media.taken_at : 0,
          likeCount:
            typeof media.like_count === "number" ? media.like_count : 0,
          code: typeof media.code === "string" ? media.code : "",
          productType: "feed",
        });
      }
    }
  }
  return posts;
}

/**
 * IG 個人頁（/{username}/）：首批貼文走載入期間的 XHR
 * （friendly name: PolarisProfilePostsQuery），分頁是
 * PolarisProfilePostsTabContentQuery_connection，共同前綴 PolarisProfilePosts。
 * 結構是 xdt_api__v1__feed__user_timeline_graphql_connection.edges[].node，
 * node 本身就是 media（比首頁 feed 少一層 .media）。
 */
export const IG_USER_TIMELINE_KEY =
  "xdt_api__v1__feed__user_timeline_graphql_connection";
export const IG_PROFILE_PAGINATION_PREFIX = "PolarisProfilePosts";

export function parseIgUserTimelineText(text: string): RawIgFeedPost[] {
  if (!text.includes(IG_USER_TIMELINE_KEY)) return [];

  const posts: RawIgFeedPost[] = [];
  for (const doc of parseJsonLines(text)) {
    const conn = deepFind(doc, IG_USER_TIMELINE_KEY) as
      { edges?: unknown[] } | undefined;
    if (!conn?.edges) continue;

    for (const edge of conn.edges) {
      const media = (edge as { node?: Record<string, unknown> }).node;
      if (!media) continue;

      const user = media.user as
        { username?: string; full_name?: string } | undefined;
      const caption = media.caption as { text?: string } | null | undefined;
      // 這個 payload 的 pk 是超過 2^53 的數字，JSON.parse 會掉精度，
      // 優先取字串型欄位（id 格式為 "{pk}_{userId}"）
      const pk =
        typeof media.pk === "string"
          ? media.pk
          : typeof media.id === "string"
            ? media.id
            : String(media.pk ?? "");
      if (!user?.username || !pk) continue;

      posts.push({
        pk,
        username: user.username,
        fullName: user.full_name ?? null,
        text: caption?.text ?? "",
        takenAt: typeof media.taken_at === "number" ? media.taken_at : 0,
        likeCount: typeof media.like_count === "number" ? media.like_count : 0,
        code: typeof media.code === "string" ? media.code : "",
        productType:
          typeof media.product_type === "string" ? media.product_type : "feed",
      });
    }
  }
  return posts;
}

export function parseIgFeedText(text: string): RawIgFeedPost[] {
  if (!text.includes(IG_FEED_CONNECTION_KEY)) return [];

  const posts: RawIgFeedPost[] = [];
  for (const doc of parseJsonLines(text)) {
    const conn = deepFind(doc, IG_FEED_CONNECTION_KEY) as
      { edges?: unknown[] } | undefined;
    if (!conn?.edges) continue;

    for (const edge of conn.edges) {
      const media = (edge as { node?: { media?: Record<string, unknown> } })
        .node?.media;
      if (!media) continue;

      const user = media.user as
        { username?: string; full_name?: string } | undefined;
      const caption = media.caption as { text?: string } | null | undefined;
      const pk =
        typeof media.pk === "string" ? media.pk : String(media.id ?? "");
      if (!user?.username || !pk) continue;

      posts.push({
        pk,
        username: user.username,
        fullName: user.full_name ?? null,
        text: caption?.text ?? "",
        takenAt: typeof media.taken_at === "number" ? media.taken_at : 0,
        likeCount: typeof media.like_count === "number" ? media.like_count : 0,
        code: typeof media.code === "string" ? media.code : "",
        productType:
          typeof media.product_type === "string" ? media.product_type : "feed",
      });
    }
  }
  return posts;
}
