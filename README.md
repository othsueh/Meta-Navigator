# Meta Navigator

MCP server，讓 Claude Desktop 的 agent 代替你瀏覽 Meta 平台（Instagram / Threads / Facebook）：總結動態牆、列出誰發了限動、收藏貼文。底層用 Playwright persistent context 操作已登入的網頁版。

> ⚠️ 瀏覽器自動化違反 Meta 服務條款，僅供個人帳號、唯讀為主、低頻率使用，風險自負。`browser-profile/` 內含登入 cookies，已列入 `.gitignore`，切勿外流。使用前請讀 [docs/SECURITY.md](docs/SECURITY.md)。

## 安裝

```bash
npm install
npx playwright install chromium
npm run build
```

## 登入（一次性）

```bash
npm run login
```

會開啟瀏覽器視窗，手動登入三個平台後回終端機按 Enter。Session 存在 `browser-profile/`。

## 接上 Claude Desktop

在 `~/Library/Application Support/Claude/claude_desktop_config.json` 加入：

```json
{
  "mcpServers": {
    "meta-navigator": {
      "command": "node",
      "args": ["/Users/othsueh/Development/350small_project/Meta_navigator/dist/index.js"]
    }
  }
}
```

重啟 Claude Desktop 後即可看到工具。

## 工具

| 工具 | 狀態 | 說明 |
|---|---|---|
| `check_login` | ✅ | 檢查平台登入狀態 |
| `open_login` | ✅ | 開有頭視窗手動登入 |
| `get_feed` | ✅ 三平台 | 讀取動態牆結構化貼文（作者、內文、讚數、連結），FB 濾掉贊助貼文 |
| `search_posts` | ✅ 三平台 | 關鍵字搜尋公開貼文，回傳結構同 `get_feed`；IG 只吃熱門主題詞，長尾詞常查無結果 |
| `get_user_posts` | ✅ 三平台 | 讀取特定帳號的個人頁貼文（handle、FB 自訂名稱／數字 ID、或個人頁網址），回傳結構同 `get_feed` |
| `list_active_stories` | ✅ IG（FB 🚧） | 列出有發限動的帳號，含未看/已看與時間 |
| `bookmark_post` | ✅ 三平台 | 從網址自動判斷平台並收藏，收藏後驗證 |

## 架構

```
src/
├── index.ts          # MCP server 進入點（stdio）
├── config.ts         # 路徑、平台 URL、頻率上限
├── tools/            # MCP 工具層（Claude 看到的介面）
├── browser/          # Playwright session 管理 + 頻率保險絲
├── platforms/        # 平台 adapter（流程邏輯）
└── extractors/       # selector 與 DOM 解析（Meta 改版只修這裡）
```

頻率保險絲：操作間隔 ≥ 5 秒、每小時 ≤ 60 次，超過直接報錯（見 `src/config.ts`）。

開發新功能（或修 Meta 改版）請照 [docs/WORKFLOW.md](docs/WORKFLOW.md) 的探測流程做。
