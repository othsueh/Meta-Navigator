import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Platform } from "../config.js";
import type { FeedPost } from "../platforms/types.js";
import { getThreadsUserPosts } from "../platforms/threads.js";
import { getIgUserPosts } from "../platforms/instagram.js";
import { getFbUserPosts } from "../platforms/facebook.js";

const FETCHERS: Record<
  Platform,
  (user: string, count: number) => Promise<FeedPost[]>
> = {
  threads: getThreadsUserPosts,
  instagram: getIgUserPosts,
  facebook: getFbUserPosts,
};

export function registerGetUserPosts(server: McpServer): void {
  server.registerTool(
    "get_user_posts",
    {
      title: "取得特定使用者的貼文",
      description:
        "讀取指定帳號的個人頁貼文（新到舊，置頂在最前），回傳與 get_feed 相同的結構化列表：" +
        "作者、內容、時間、讚數、連結。" +
        "user 參數在 Instagram / Threads 填 @handle（有沒有 @ 都可以），" +
        "Facebook 填個人檔案的自訂名稱或數字 ID；三個平台也都接受直接貼整段個人頁網址。" +
        "抓不到任何貼文時會回報錯誤與可能原因（帳號不存在／私人帳號／隱私設定）；" +
        "Facebook 非好友可見的內容受對方隱私設定限制，實際抓到的可能比要求的少。",
      inputSchema: {
        platform: z
          .enum(["instagram", "threads", "facebook"])
          .describe("要讀取的平台"),
        user: z
          .string()
          .min(1)
          .describe("帳號 handle、FB 自訂名稱／數字 ID、或個人頁網址"),
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("要抓取的貼文數量"),
      },
    },
    async ({ platform, user, count }) => {
      try {
        const posts = await FETCHERS[platform](user, count);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { platform, user, count: posts.length, posts },
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
