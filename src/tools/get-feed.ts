import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Platform } from "../config.js";
import type { FeedPost } from "../platforms/types.js";
import { getFeed as getThreadsFeed } from "../platforms/threads.js";
import { getIgFeed } from "../platforms/instagram.js";
import { getFeed as getFbFeed } from "../platforms/facebook.js";

const FEED_GETTERS: Record<Platform, (count: number) => Promise<FeedPost[]>> = {
  threads: getThreadsFeed,
  instagram: getIgFeed,
  facebook: getFbFeed,
};

export function registerGetFeed(server: McpServer): void {
  server.registerTool(
    "get_feed",
    {
      title: "讀取動態牆",
      description:
        "讀取指定平台的動態牆，回傳結構化的貼文列表：作者、內容、時間、讚數、連結。" +
        "呼叫端負責總結。內容是各平台的演算法時間軸（追蹤中＋推薦），廣告已濾掉。",
      inputSchema: {
        platform: z
          .enum(["instagram", "threads", "facebook"])
          .describe("要讀取的平台"),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("要抓取的貼文數量"),
      },
    },
    async ({ platform, count }) => {
      try {
        const posts = await FEED_GETTERS[platform](count);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { platform, count: posts.length, posts },
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
              text: `讀取失敗：${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
