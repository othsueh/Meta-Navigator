import { deepFind, deepCollect, parseJsonLines } from "./json-utils.js";

/**
 * FB 首頁 feed：內嵌 script（特徵: comet_sections + "Story"）與分頁 XHR
 * （friendly name: CometNewsFeedPaginationQuery，body 是多行 JSON stream，
 * 每個回應通常只帶一篇貼文＋一堆 deferred payload）。
 *
 * FB 的結構深且常變，不硬記路徑：深度收集 __typename === 'Story' 的物件，
 * 再從各自的子樹裡挖欄位。FB 改版時優先檢查這些特徵。
 */
export interface RawFbPost {
  key: string; // 去重用（URL 或 story id）
  actor: string;
  text: string;
  creationTime: number; // epoch 秒，挖不到就 0
  reactionCount: number;
  url: string;
  sponsored: boolean;
}

export const FB_PAGINATION_FRIENDLY_NAME = "CometNewsFeedPaginationQuery";

/**
 * FB 搜尋頁（/search/posts?q=...）的結果一樣是 comet_sections 的 Story，
 * 內嵌與分頁都用 parseFbFeedText 解析，只有分頁 friendly name 不同。
 */
export const FB_SEARCH_PAGINATION_FRIENDLY_NAME =
  "SearchCometResultsPaginatedResultsQuery";

/**
 * FB 個人頁／粉專時間軸的貼文一樣是 comet_sections 的 Story
 * （首批也走載入期間的這支 XHR，內嵌 HTML 通常只有置頂一篇），
 * 只有分頁 friendly name 不同。
 */
export const FB_PROFILE_PAGINATION_FRIENDLY_NAME =
  "ProfileCometTimelineFeedRefetchQuery";

export function parseFbFeedText(text: string): RawFbPost[] {
  if (!text.includes("comet_sections")) return [];

  const posts: RawFbPost[] = [];
  for (const doc of parseJsonLines(text)) {
    // 只收「頂層」Story（match 到就不往子樹深入），
    // 避免把轉發的 attached_story 當成獨立貼文
    const stories = deepCollect(
      doc,
      (obj) =>
        obj.__typename === "Story" &&
        typeof obj.comet_sections === "object" &&
        obj.comet_sections !== null,
    );

    for (const story of stories) {
      const message = deepFind(story, "message") as
        { text?: string } | undefined;
      const storyText = typeof message?.text === "string" ? message.text : "";

      const actors = deepFind(story, "actors") as
        { name?: string }[] | undefined;
      const actor = actors?.[0]?.name ?? "";

      const url =
        (deepFind(story, "wwwURL") as string | undefined) ??
        (deepFind(story, "www_url") as string | undefined) ??
        "";

      // 沒有作者又沒有內文的多半是 feed 單元（推薦、廣告框架），跳過
      if (!actor || (!storyText && !url)) continue;

      const creationTime = deepFind(story, "creation_time");
      const reaction = deepFind(story, "reaction_count") as
        { count?: number } | undefined;

      const key =
        url ||
        (typeof story.id === "string" ? story.id : "") ||
        `${actor}:${storyText.slice(0, 40)}`;

      posts.push({
        key,
        actor,
        text: storyText,
        creationTime: typeof creationTime === "number" ? creationTime : 0,
        reactionCount: typeof reaction?.count === "number" ? reaction.count : 0,
        url,
        sponsored: JSON.stringify(story).includes('"is_sponsored":true'),
      });
    }
  }
  return posts;
}
