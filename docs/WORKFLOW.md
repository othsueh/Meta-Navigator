# 開發工作流程

這份文件描述 Meta Navigator 的功能開發方法論——每個現有工具（`get_feed`、`search_posts`、`get_user_posts`、`bookmark_post`…）都是照這套流程做出來的。新功能請沿用同一套，改版修復也照同樣的探測步驟重跑一次。

## 核心原則

1. **不猜 payload，先探測**。Meta 的 GraphQL 結構沒有公開文件且常變，任何 marker（內嵌 script 的特徵 key、分頁 XHR 的 friendly name、JSON 路徑）都必須從「登入中的真實瀏覽器」dump 下來確認，不能憑印象或訓練資料寫。
2. **分層不越界**。`tools/`（MCP 介面）→ `platforms/`（流程）→ `extractors/`（解析與 selector）→ `browser/`（session 與頻率保險絲）。Meta 改版時只修 `extractors/`，這是分層的全部意義。
3. **頻率保險絲不可拆**：操作間隔 ≥ 5 秒、每小時 ≤ 60 次（`src/config.ts`）。所有拿 Page 的路徑都必須經過 `preparePage()` / `openPage()`，讓保險絲生效。
4. **`browser-profile/` 內含登入 cookies**，已在 `.gitignore`，任何情況下不得進版控、不得外流、不得出現在 log 或 dump 的公開位置。

## 新增「讀取類」功能（feed / 搜尋 / 個人頁這一類）

三個平台的讀取功能都是同一個模式，由 `src/platforms/feed-collector.ts` 的 `collectFeed` 統一實作：

> 開頁 → 解析內嵌 `script[type="application/json"]` 拿第一批 → 捲動觸發 lazy load → 攔截分頁 GraphQL XHR（以 `x-fb-friendly-name` 辨識）→ 以 key 去重 → 湊滿 count。

所以新增一個讀取來源，實際要找的東西只有三樣：**頁面 URL**、**內嵌 script 的特徵 key**、**分頁 XHR 的 friendly name**。步驟如下：

### 1. 寫 probe script 探測

在 scratchpad 寫一支 `.mts`（專案外的暫存目錄不吃 `type: module`，用 `.mts` 避開 tsx 的 CJS 錯誤），直接 import 專案的 `session.ts`：

- `preparePage()` 拿分頁，**導航前**就掛 `page.on("response")`——有些頁面（IG 搜尋、IG 個人頁）的第一批結果是載入期間的 XHR，載入完才掛就漏掉了。
- 記錄所有 `/graphql` 回應的 friendly name 與大小，body 存檔。
- 導航後 dump 所有夠大的內嵌 `script[type="application/json"]`。
- 捲動兩輪，看分頁 XHR 的 friendly name 是什麼。

參考本 session 用過的範本：探測時「幾百 KB 的那支」幾乎一定是資料本體，幾 KB 的是設定與雜訊。

### 2. 從 dump 找 marker

- 用 `grep` / 小段 Python 找特徵 key 與 JSON 路徑。
- 確認內嵌 script 的特徵組合**夠獨特**（例如 Threads 的 feed 是 `thread_items`+`feedData`、搜尋是 `thread_items`+`searchResults`、個人頁是 `thread_items`+`mediaData`）。
- **先拿現有 parser 對 dump 跑離線測試**——三個平台的 payload 高度同構，經常直接重用（Threads 的 `parseThreadsFeedText`、FB 的 `parseFbFeedText` 至今通吃 feed／搜尋／個人頁三種來源）。能重用就不要新寫。

### 3. 寫程式（由內往外）

1. `extractors/{platform}.ts`：加 marker 常數與（必要時）新 parser。檔頭註解寫清楚資料結構與特徵，**改版時第一個看的就是這裡**。
2. `platforms/{platform}.ts`：加一個函式，組 URL、呼叫 `collectFeed`、map 成 `FeedPost`。輸入寬容化（handle 去 @、接受整段網址）放在這一層。
3. `platforms/types.ts`：`PlatformAdapter` 加對應的 optional 方法。
4. `tools/{tool-name}.ts`：新 MCP 工具，zod schema + 中文描述。**描述要把平台限制寫進去**（agent 只看得到描述），例如 IG 搜尋只吃熱門詞、FB 受隱私設定限制。
5. `index.ts` 註冊、`README.md` 工具表加一列。

### 4. 實機測試

- `scripts/test-{feature}.ts` 寫一支開發測試（照 `test-feed.ts` 等既有格式），`npm run build` 後對三個平台各跑一次真實查詢。
- 測試要順便驗證輸入寬容化（`@handle`、整段 URL）。
- **會改變帳號狀態的測試必須復原**（收藏測試 save 完要 unsave）。

## 語意約定

- **空結果的語意每個功能不同，要想清楚**：搜尋回空是合法結果（關鍵字冷門），回空列表不報錯；個人頁回空幾乎一定是出錯（帳號不存在／私人），直接 throw 並在錯誤訊息裡列出可能原因，讓 agent 知道怎麼跟使用者說。
- **去重 key 要防精度陷阱**：IG 個人頁的 `pk` 是超過 2^53 的 JSON 數字，`JSON.parse` 會掉精度，去重改用字串欄位（貼文 code）。
- **廣告過濾看場景**：動態牆與搜尋要濾 sponsored（先多收 `count * 2` 再濾再截）；個人時間軸不濾——被標 sponsored 的是本人推廣的真實貼文。
- 錯誤訊息一律指向該修的檔案（「——XX 可能改版了，請檢查 src/extractors/xx.ts」）。

## 已知平台特性（不是 bug，別重新 debug）

- **IG 關鍵字搜尋只涵蓋有索引的熱門主題詞**，多字詞／長尾詞常回空。對策：換更短更通用的關鍵字重試。
- **IG 搜尋與個人頁的第一批結果不內嵌在 HTML**，全走載入期 XHR——這就是 listener 必須在導航前掛好的原因。
- **FB 的分頁 XHR body 是多行 JSON stream**（一行一個 JSON），用 `parseJsonLines` 處理；FB 結構深且常變，不硬記路徑，用 `deepFind` / `deepCollect` 深度搜尋。
- **FB 顯示名稱不唯一**，個人頁定位要靠自訂名稱、數字 ID 或整段網址。
- IG 個人頁貼文格**包含共同作者的合作貼文**，如實回傳。

## 呈現層（skills/meta-digest）

MCP server 只管回資料；**資料怎麼呈現由 Claude Desktop 的 skill 決定**，兩邊分開演進。skill 資料夾固定三個檔案：

- `SKILL.md`：流程規範（怎麼呼叫工具、怎麼分群、怎麼呈現）。
- `template.html`（get_feed 手風琴）與 `template-search.html`（搜尋插畫場景）：**模板即正典**——agent 產 artifact 時整份照用，只替換模板裡明確標出的常數（色盤／主題、meta、資料陣列），排版與計算邏輯一律不准 agent 自己寫，這是每次產出品質一致的關鍵。
- 模板改版流程：改 HTML → 用 `.claude/launch.json` 的 `digest-preview`（port 4173）預覽驗證（桌面＋窄視窗都要看）→ 同步更新 `SKILL.md` 的描述 → 提醒使用者重新上傳 skill 資料夾。
- 使用者的固定偏好：**配色一律低刺激、不用螢光色**；中央文字必須在底色上清楚可讀。

## 每次改完的收尾

1. `npm run build`（tsc 過了才算數）。
2. 實機測試至少各平台一次。
3. README 工具表與相關文件同步。
4. MCP server 有改的話，提醒使用者重啟 Claude Desktop 才會載入新工具。
