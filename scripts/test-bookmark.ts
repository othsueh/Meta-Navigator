/**
 * 開發用：測試收藏功能。先收藏 → 驗證 → 再取消收藏（還原，不留痕跡）。
 * 用法：npx tsx scripts/test-bookmark.ts <post-url> [--keep]
 */
import { setIgBookmark } from "../src/platforms/instagram.js";
import { setThreadsBookmark } from "../src/platforms/threads.js";
import { setFbBookmark } from "../src/platforms/facebook.js";
import { closeBrowser } from "../src/browser/session.js";

const url = process.argv[2];
const keep = process.argv.includes("--keep");
if (!url)
  throw new Error("用法：npx tsx scripts/test-bookmark.ts <post-url> [--keep]");

const host = new URL(url).hostname;
const setBookmark = host.endsWith("instagram.com")
  ? setIgBookmark
  : host.endsWith("threads.com") || host.endsWith("threads.net")
    ? setThreadsBookmark
    : setFbBookmark;

console.log("1) 收藏中…");
console.log("   →", await setBookmark(url, true));

if (!keep) {
  console.log("2) 取消收藏（還原）…");
  console.log("   →", await setBookmark(url, false));
}

await closeBrowser();
console.log("done");
