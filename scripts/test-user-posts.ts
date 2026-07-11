/**
 * 開發用測試：抓特定使用者的個人頁貼文。
 * 用法：npx tsx scripts/test-user-posts.ts <threads|instagram|facebook> <user> [count]
 */
import { closeBrowser } from "../src/browser/session.js";
import { getThreadsUserPosts } from "../src/platforms/threads.js";
import { getIgUserPosts } from "../src/platforms/instagram.js";
import { getFbUserPosts } from "../src/platforms/facebook.js";

const FETCHERS = {
  threads: getThreadsUserPosts,
  instagram: getIgUserPosts,
  facebook: getFbUserPosts,
} as const;

const platform = process.argv[2] as keyof typeof FETCHERS;
const user = process.argv[3];
const count = Number(process.argv[4] ?? 10);

if (!FETCHERS[platform] || !user) {
  console.error(
    "用法：npx tsx scripts/test-user-posts.ts <threads|instagram|facebook> <user> [count]",
  );
  process.exit(1);
}

try {
  const posts = await FETCHERS[platform](user, count);
  console.log(`${platform} / ${user} → ${posts.length} 篇\n`);
  for (const p of posts) {
    console.log(`— ${p.author}  ♥${p.likes ?? "?"}  ${p.timestamp ?? ""}`);
    console.log(`  ${p.text.slice(0, 80).replaceAll("\n", " ")}`);
    console.log(`  ${p.url ?? "(無網址)"}\n`);
  }
} finally {
  await closeBrowser();
}
