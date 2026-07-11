/**
 * 開發用：直接呼叫 instagram adapter 測試 getActiveStories。
 */
import { getActiveStories } from "../src/platforms/instagram.js";
import { closeBrowser } from "../src/browser/session.js";

const stories = await getActiveStories();
console.log(
  JSON.stringify(
    {
      count: stories.length,
      unseen: stories.filter((s) => s.hasUnseen).length,
      stories,
    },
    null,
    2,
  ),
);
await closeBrowser();
