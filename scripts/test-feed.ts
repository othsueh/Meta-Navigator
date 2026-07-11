/**
 * 開發用：直接呼叫平台 adapter 測試 getFeed。
 * 用法：npx tsx scripts/test-feed.ts [threads|instagram|facebook] [count]
 */
import { getFeed as getThreadsFeed } from "../src/platforms/threads.js";
import { getIgFeed } from "../src/platforms/instagram.js";
import { getFeed as getFbFeed } from "../src/platforms/facebook.js";
import { closeBrowser } from "../src/browser/session.js";

const platform = process.argv[2] ?? "threads";
const count = Number(process.argv[3] ?? 10);

const getters: Record<string, (n: number) => Promise<unknown[]>> = {
  threads: getThreadsFeed,
  instagram: getIgFeed,
  facebook: getFbFeed,
};

const posts = (await getters[platform](count)) as {
  author: string;
  text: string;
  timestamp?: string;
  likes?: number;
  url?: string;
}[];

console.log(`[${platform}] got ${posts.length} posts\n`);
for (const p of posts) {
  console.log(
    `- ${p.author} | ❤️ ${p.likes} | ${p.timestamp}\n  ${p.text.slice(0, 60).replaceAll("\n", " ")}\n  ${p.url}`,
  );
}
await closeBrowser();
