import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLATFORM_URLS } from "../config.js";
import { openPage } from "../browser/session.js";

export function registerOpenLogin(server: McpServer): void {
  server.registerTool(
    "open_login",
    {
      title: "開啟登入視窗",
      description:
        "開啟一個有頭（headed）瀏覽器視窗到指定平台，讓使用者手動登入。" +
        "登入狀態會存在 persistent profile 裡，之後的工具呼叫都會沿用。" +
        "登入完成後使用者可以直接把視窗放著，下一次工具呼叫會自動切回背景模式。",
      inputSchema: {
        platform: z
          .enum(["instagram", "threads", "facebook"])
          .describe("要登入的平台"),
      },
    },
    async ({ platform }) => {
      await openPage(PLATFORM_URLS[platform], { headed: true });
      return {
        content: [
          {
            type: "text",
            text:
              `已開啟 ${platform} 的瀏覽器視窗，請使用者在該視窗中手動完成登入` +
              `（包含兩步驟驗證）。完成後可呼叫 check_login 確認。`,
          },
        ],
      };
    },
  );
}
