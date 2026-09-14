import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeBrowser } from "./browser/session.js";
import { registerCheckLogin } from "./tools/check-login.js";
import { registerOpenLogin } from "./tools/open-login.js";
import { registerGetFeed } from "./tools/get-feed.js";
import { registerSearchPosts } from "./tools/search-posts.js";
import { registerGetUserPosts } from "./tools/get-user-posts.js";
import { registerBookmarkPost } from "./tools/bookmark-post.js";

const server = new McpServer({
  name: "meta-navigator",
  version: "0.1.0",
});

registerCheckLogin(server);
registerOpenLogin(server);
registerGetFeed(server);
registerSearchPosts(server);
registerGetUserPosts(server);
registerBookmarkPost(server);

async function shutdown(): Promise<void> {
  await closeBrowser().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// client（Claude Desktop）斷線關閉 stdin 時，關閉瀏覽器並退出，
// 否則 persistent context 會讓 process 永遠掛著
process.stdin.on("end", shutdown);
process.stdin.on("close", shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout 是 MCP 的通訊管道，log 一律走 stderr
console.error("meta-navigator MCP server running on stdio");
