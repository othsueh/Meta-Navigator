import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Platform } from "../config.js";
import type { FeedPost } from "../platforms/types.js";
import { searchThreadsPosts } from "../platforms/threads.js";
import { searchIgPosts } from "../platforms/instagram.js";
import { searchFbPosts } from "../platforms/facebook.js";

const SEARCHERS: Record<
  Platform,
  (query: string, count: number) => Promise<FeedPost[]>
> = {
  threads: searchThreadsPosts,
  instagram: searchIgPosts,
  facebook: searchFbPosts,
};

export function registerSearchPosts(server: McpServer): void {
  server.registerTool(
    "search_posts",
    {
      title: "搜尋貼文",
      description:
        "在指定平台用關鍵字搜尋公開貼文，回傳與 get_feed 相同的結構化列表：" +
        "作者、內容、時間、讚數、連結。結果是平台的相關度排序（熱門優先），廣告已濾掉。" +
        "搜尋不到時回傳空列表，不代表出錯。" +
        "注意：Instagram 的關鍵字搜尋只涵蓋有索引的熱門主題詞，" +
        "多字詞或冷門詞常查無結果，改用更短、更通用的關鍵字重試；" +
        "Threads 與 Facebook 對長查詢的支援好得多。",
      inputSchema: {
        platform: z
          .enum(["instagram", "threads", "facebook"])
          .describe("要搜尋的平台"),
        query: z.string().min(1).describe("搜尋關鍵字，例如「AI 工具」"),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("要抓取的貼文數量"),
      },
    },
    async ({ platform, query, count }) => {
      try {
        const posts = await SEARCHERS[platform](query, count);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { platform, query, count: posts.length, posts },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `搜尋失敗：${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
