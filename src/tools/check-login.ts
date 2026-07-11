import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLATFORM_URLS, type Platform } from "../config.js";
import { getContext } from "../browser/session.js";

// 各平台登入後一定會存在的 session cookie。
// 比 DOM heuristic 可靠得多，而且不需要實際載入頁面。
const SESSION_COOKIES: Record<Platform, string> = {
  instagram: "sessionid",
  threads: "sessionid",
  facebook: "c_user",
};

export function registerCheckLogin(server: McpServer): void {
  server.registerTool(
    "check_login",
    {
      title: "檢查登入狀態",
      description:
        "檢查指定平台是否已有登入 session（透過 session cookie 判斷，不會載入頁面）。" +
        "若未登入，請使用者執行 npm run login 或呼叫 open_login。" +
        "注意：cookie 存在但已過期的情況無法在此偵測，實際操作失敗時請引導使用者重新登入。",
      inputSchema: {
        platform: z
          .enum(["instagram", "threads", "facebook"])
          .describe("要檢查的平台"),
      },
    },
    async ({ platform }) => {
      const ctx = await getContext();
      const cookies = await ctx.cookies(PLATFORM_URLS[platform]);
      const cookieName = SESSION_COOKIES[platform];
      const session = cookies.find(
        (c) => c.name === cookieName && c.value.length > 0,
      );

      const status = session
        ? `✅ ${platform} 已有登入 session（cookie: ${cookieName}）。`
        : `❌ ${platform} 未登入。請在終端機執行 \`npm run login\`（會開啟瀏覽器視窗手動登入），或呼叫 open_login 工具。`;

      return { content: [{ type: "text", text: status }] };
    },
  );
}
