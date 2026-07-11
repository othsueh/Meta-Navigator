/**
 * 手動登入用的 script：開啟有頭瀏覽器，三個平台各開一個分頁，
 * 登入完成後回到終端機按 Enter，session 會存進 browser-profile/。
 *
 * 執行方式：npm run login
 */
import readline from "node:readline";
import { getContext, closeBrowser } from "../src/browser/session.js";
import { PLATFORM_URLS } from "../src/config.js";

const context = await getContext({ headed: true });

const entries = Object.entries(PLATFORM_URLS);
for (let i = 0; i < entries.length; i++) {
  const [platform, url] = entries[i];
  const page =
    i === 0
      ? (context.pages()[0] ?? (await context.newPage()))
      : await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch((err) => {
    console.error(`⚠️  ${platform} 開啟失敗：${err.message}`);
  });
  console.log(`已開啟 ${platform}：${url}`);
}

console.log("\n請在瀏覽器視窗中逐一登入三個平台（含兩步驟驗證）。");
console.log("全部登入完成後，回到這裡按 Enter 結束並儲存 session。\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
await new Promise<void>((resolve) =>
  rl.question("登入完成後按 Enter…", () => resolve()),
);
rl.close();

await closeBrowser();
console.log(
  "✅ Session 已儲存到 browser-profile/，之後 MCP server 會直接沿用登入狀態。",
);
