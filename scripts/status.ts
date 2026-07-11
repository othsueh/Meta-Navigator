/**
 * 檢查三個平台的登入狀態（讀 profile 裡的 session cookies）。
 * 執行方式：npm run status
 */
import { getContext, closeBrowser } from "../src/browser/session.js";

const ctx = await getContext();
const cookies = await ctx.cookies();

const checks = [
  ["instagram", "instagram.com", "sessionid"],
  ["threads", "threads.com", "sessionid"],
  ["facebook", "facebook.com", "c_user"],
] as const;

for (const [platform, domain, name] of checks) {
  const found = cookies.some(
    (c) => c.domain.includes(domain) && c.name === name && c.value.length > 0,
  );
  console.log(`${platform}: ${found ? "✅ 已登入" : "❌ 未登入"}`);
}

await closeBrowser();
