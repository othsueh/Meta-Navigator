import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getActiveStories } from "../platforms/instagram.js";

export function registerListStories(server: McpServer): void {
  server.registerTool(
    "list_active_stories",
    {
      title: "列出目前有限動的帳號",
      description:
        "列出指定平台上目前有發限時動態的帳號，含是否有未看過的限動、最新限動時間。" +
        "只讀取限動列表，不會點開限動、不會產生已讀。Threads 沒有限動功能。",
      inputSchema: {
        platform: z
          .enum(["instagram", "facebook"])
          .describe("要檢查的平台（Threads 無限動）"),
      },
    },
    async ({ platform }) => {
      if (platform === "facebook") {
        return {
          content: [
            {
              type: "text",
              text: "NOT_IMPLEMENTED: Facebook 的限動列表尚未實作，目前只支援 instagram。",
            },
          ],
          isError: true,
        };
      }

      try {
        const stories = await getActiveStories();
        const summary = {
          platform,
          count: stories.length,
          unseenCount: stories.filter((s) => s.hasUnseen).length,
          stories,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
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
