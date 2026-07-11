/**
 * 開發用：直接呼叫平台 adapter 測試 searchPosts。
 * 用法：npx tsx scripts/test-search.ts [threads|instagram|facebook] [關鍵字] [count]
 */
import { searchThreadsPosts } from "../src/platforms/threads.js";
import { searchIgPosts } from "../src/platforms/instagram.js";
import { searchFbPosts } from "../src/platforms/facebook.js";
import { closeBrowser } from "../src/browser/session.js";
import type { FeedPost } from "../src/platforms/types.js";

const platform = process.argv[2] ?? "threads";
const query = process.argv[3] ?? "AI";
const count = Number(process.argv[4] ?? 10);

const searchers: Record<string, (q: string, n: number) => Promise<FeedPost[]>> =
  {
    threads: searchThreadsPosts,
    instagram: searchIgPosts,
    facebook: searchFbPosts,
  };

const posts = await searchers[platform](query, count);

console.log(`[${platform}] "${query}" got ${posts.length} posts\n`);
for (const p of posts) {
  console.log(
    `- ${p.author} | ❤️ ${p.likes} | ${p.timestamp}\n  ${p.text.slice(0, 60).replaceAll("\n", " ")}\n  ${p.url}`,
  );
}
await closeBrowser();
