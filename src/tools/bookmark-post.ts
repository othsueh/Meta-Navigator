import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { setIgBookmark } from "../platforms/instagram.js";
import { setThreadsBookmark } from "../platforms/threads.js";
import { setFbBookmark } from "../platforms/facebook.js";

/** host 是否等於 domain 本身或其子網域（www.facebook.com ✓，evilfacebook.com ✗）。
 * 用 endsWith 檢查網域會誤放 lookalike 網域（"evilfacebook.com".endsWith("facebook.com")
 * 為 true），這裡改成精確比對 host 或帶前導點的子網域。 */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function pickPlatform(
  url: string,
): ((u: string, want: boolean) => Promise<"changed" | "already">) | null {
  let host: string;
  try {
    const parsed = new URL(url);
    // 只接受 http/https，擋掉 javascript: / file: 之類的協定
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hostMatches(host, "instagram.com")) return setIgBookmark;
  if (hostMatches(host, "threads.com") || hostMatches(host, "threads.net")) {
    return setThreadsBookmark;
  }
  if (hostMatches(host, "facebook.com")) return setFbBookmark;
  return null;
}

export function registerBookmarkPost(server: McpServer): void {
  server.registerTool(
    "bookmark_post",
    {
      title: "收藏貼文",
      description:
        "把指定貼文加入該平台的收藏（Instagram 的「珍藏」、Facebook 的「儲存貼文」、Threads 的「儲存」）。" +
        "從網址自動判斷平台。收藏後會驗證狀態確實改變。",
      inputSchema: {
        url: z
          .string()
          .url()
          .describe("貼文的完整網址，例如 https://www.instagram.com/p/xxxx/"),
      },
    },
    async ({ url }) => {
      const setBookmark = pickPlatform(url);
      if (!setBookmark) {
        return {
          content: [
            {
              type: "text",
              text: `不支援的網址：${url}（支援 instagram.com / threads.com / facebook.com）`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await setBookmark(url, true);
        return {
          content: [
            {
              type: "text",
              text:
                result === "changed"
                  ? `✅ 已收藏並驗證：${url}`
                  : `ℹ️ 這篇本來就在收藏裡：${url}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `收藏失敗：${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
