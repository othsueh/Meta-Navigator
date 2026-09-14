# Meta Navigator

MCP server，讓任何支援 MCP 的 AI 工具（Claude Desktop、Claude Code、Cursor、VS Code、Gemini CLI、Codex……）代替你瀏覽 Meta 平台（Instagram / Threads / Facebook）：總結動態牆、關鍵字搜尋、讀特定帳號的貼文、收藏貼文。底層用 Playwright persistent context 操作已登入的網頁版。

> ⚠️ 瀏覽器自動化違反 Meta 服務條款，僅供個人帳號、唯讀為主、低頻率使用，風險自負。`browser-profile/` 內含登入 cookies，已列入 `.gitignore`，切勿外流。使用前請讀 [docs/SECURITY.md](docs/SECURITY.md)。

## 安裝

需求：Node.js 20 以上（開發時使用 22）。

```bash
git clone https://github.com/othsueh/Meta-Navigator.git
cd Meta-Navigator
npm install
npx playwright install chromium
npm run build
```

`npm run build` 會產生 `dist/index.js`，也就是後面所有 AI 工具要啟動的檔案。之後每次 `git pull` 都要重新 build。

## 登入（一次性）

```bash
npm run login
```

會開啟瀏覽器視窗，手動登入三個平台後回終端機按 Enter。Session 存在專案內的 `browser-profile/`。之後可用 `npm run status` 檢查三個平台的登入狀態。

## 接上你的 AI 工具

本專案是標準的 **stdio MCP server**，任何支援本地（stdio）MCP server 的工具都能用。設定內容都是同一件事：用 `node` 啟動 `dist/index.js`，差別只在各工具的設定檔位置與格式。

下面所有範例中的 `/ABSOLUTE/PATH/TO/Meta-Navigator` 請換成你 clone 下來的**絕對路徑**（在專案目錄執行 `pwd` 可取得；Windows 的 JSON 內路徑要寫成 `C:\\Users\\you\\Meta-Navigator\\dist\\index.js`）。

| 工具 | 狀態 | 設定方式 |
|---|---|---|
| Claude Desktop | ✅ 已實測 | `claude_desktop_config.json` |
| Claude Code | ✅ 已實測 | `claude mcp add` |
| 任何 stdio MCP client | ✅ 已用官方 Inspector 驗證 | 見「疑難排解」 |
| Cursor | 📄 依官方文件 | `~/.cursor/mcp.json` |
| VS Code（GitHub Copilot） | 📄 依官方文件 | `.vscode/mcp.json` 或 `code --add-mcp` |
| Windsurf | 📄 依官方文件 | `~/.codeium/windsurf/mcp_config.json` |
| Cline | 📄 依官方文件 | MCP Servers 面板 |
| Gemini CLI | 📄 依官方文件 | `gemini mcp add` |
| Google Antigravity | 📄 依官方文件 | `~/.gemini/config/mcp_config.json` |
| OpenAI Codex CLI / ChatGPT 桌面版 | 📄 依官方文件 | `codex mcp add`（設定共用） |
| Zed | 📄 依官方文件 | `settings.json` → `context_servers` |
| JetBrains AI Assistant | 📄 依官方文件 | Settings → AI Assistant → MCP |
| OpenCode | 📄 依官方文件 | `opencode.json` → `mcp` |

「已實測」代表在 macOS 上實際接上並確認工具清單可讀取；「依官方文件」代表設定格式取自該工具 2026 年 9 月的官方文件，但未在本專案實際跑過。如果你在其中一個工具上測成功（或失敗），歡迎開 issue 回報。

### Claude Desktop

設定檔位置：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

也可以從 Claude 選單 → Settings → Developer → Edit Config 開啟。加入：

```json
{
  "mcpServers": {
    "meta-navigator": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"]
    }
  }
}
```

完全退出並重啟 Claude Desktop，在對話框左下角的「+」→ Connectors 裡就會看到 `meta-navigator` 與它的工具。

### Claude Code

```bash
claude mcp add --transport stdio meta-navigator -- node /ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js
```

預設只對目前專案目錄生效；想在所有專案都能用，加上 `--scope user`。用 `claude mcp list` 確認狀態顯示 `✓ Connected`，或在對話中輸入 `/mcp`。

### Cursor

編輯 `~/.cursor/mcp.json`（全域）或專案內的 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "meta-navigator": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"]
    }
  }
}
```

儲存後在 Cursor 設定的 MCP 區塊把它打開；連線問題可看 Output 面板的 MCP Logs。

### VS Code（GitHub Copilot）

在工作區建立 `.vscode/mcp.json`（注意頂層 key 是 `servers`，不是 `mcpServers`）：

```json
{
  "servers": {
    "meta-navigator": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"]
    }
  }
}
```

或用指令列一次加到使用者設定：

```bash
code --add-mcp '{"name":"meta-navigator","command":"node","args":["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"]}'
```

Command Palette 執行 **MCP: List Servers** 可看到狀態並啟動。

### Windsurf

編輯 `~/.codeium/windsurf/mcp_config.json`（或從 Cascade 面板右上的 MCPs 圖示進入）：

```json
{
  "mcpServers": {
    "meta-navigator": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"]
    }
  }
}
```

### Cline

Cline 面板 → MCP Servers 圖示 → Configure → Configure MCP Servers，在 `mcpServers` 下加入：

```json
{
  "mcpServers": {
    "meta-navigator": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Cline CLI 的設定檔在 `~/.cline/mcp.json`，格式相同。

### Gemini CLI

```bash
gemini mcp add meta-navigator node /ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js
```

或直接編輯 `~/.gemini/settings.json` 的 `mcpServers`（格式同 Cursor）。在對話中輸入 `/mcp` 可確認連線與工具清單。

### Google Antigravity

編輯 `~/.gemini/config/mcp_config.json`（全域）或工作區的 `.agents/mcp_config.json`，格式同 Cursor。也可以從 agent 側欄的 **…** → MCP Servers → Manage MCP Servers → View raw config 進入。

### OpenAI Codex CLI / ChatGPT 桌面版 / Codex IDE 擴充

```bash
codex mcp add meta-navigator -- node /ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js
```

等同於在 `~/.codex/config.toml` 加入：

```toml
[mcp_servers.meta-navigator]
command = "node"
args = ["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"]
```

依 OpenAI 文件，ChatGPT 桌面版、Codex CLI 與 IDE 擴充共用這份設定，設定一次即可在三者間切換。ChatGPT 網頁版不能連本地 server。

### Zed

Settings → AI → MCP Servers → Add Server → Add Local Server，或直接在 `settings.json` 加入：

```json
{
  "context_servers": {
    "meta-navigator": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"],
      "env": {}
    }
  }
}
```

設定頁的 server 名稱旁指示燈變綠即代表連上。

### JetBrains AI Assistant

Settings → Tools → AI Assistant → Model Context Protocol (MCP) → 新增，選擇 **As JSON**，貼上與 Cursor 相同格式的 JSON；可在 Server level 選擇全域或僅限本專案。

### OpenCode

編輯 `opencode.json`（或 `opencode.jsonc`），注意這裡的 `command` 是陣列：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "meta-navigator": {
      "type": "local",
      "command": ["node", "/ABSOLUTE/PATH/TO/Meta-Navigator/dist/index.js"],
      "enabled": true
    }
  }
}
```

## 工具

| 工具 | 狀態 | 說明 |
|---|---|---|
| `check_login` | ✅ | 檢查平台登入狀態 |
| `open_login` | ✅ | 開有頭視窗手動登入 |
| `get_feed` | ✅ 三平台 | 讀取動態牆結構化貼文（作者、內文、讚數、連結），FB 濾掉贊助貼文 |
| `search_posts` | ✅ 三平台 | 關鍵字搜尋公開貼文，回傳結構同 `get_feed`；IG 只吃熱門主題詞，長尾詞常查無結果 |
| `get_user_posts` | ✅ 三平台 | 讀取特定帳號的個人頁貼文（handle、FB 自訂名稱／數字 ID、或個人頁網址），回傳結構同 `get_feed` |
| `bookmark_post` | ✅ 三平台 | 從網址自動判斷平台並收藏，收藏後驗證 |

搭配 [`skills/meta-digest`](skills/meta-digest/SKILL.md) 這個 skill，可以讓 Claude 把 `get_feed` / `search_posts` 的結果依興趣分群並產生視覺化摘要。

## 疑難排解

**先確認 server 本身能跑。** 用 MCP 官方的 Inspector 直接對 `dist/index.js` 做一次握手並列出工具，不經過任何 AI 工具：

```bash
npx -y @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

看到 `check_login`、`get_feed` 等六個工具就代表 server 正常，問題出在 client 端設定。

**GUI 工具找不到 `node`。** Claude Desktop、Cursor 這類從 Dock／開始功能表啟動的應用程式不會繼承終端機的 PATH（尤其是用 nvm、volta、fnm 裝的 Node）。把設定裡的 `"command": "node"` 改成 `which node` 印出的絕對路徑（例如 `/opt/homebrew/bin/node` 或 `~/.nvm/versions/node/v22.20.0/bin/node`）。

**改了設定沒反應。** 大多數 GUI 工具要完全退出再重開才會重新讀設定。Claude Desktop 的 MCP log 在 macOS `~/Library/Logs/Claude/mcp*.log`、Windows `%APPDATA%\Claude\logs`。

**工具回報未登入。** 在專案目錄跑 `npm run status` 檢查；session 過期就重跑 `npm run login`。

**第一次呼叫很慢。** 工具會真的開瀏覽器載入頁面，加上頻率保險絲，一次 20–30 秒屬正常。

## 架構

```
src/
├── index.ts          # MCP server 進入點（stdio）
├── config.ts         # 路徑、平台 URL、頻率上限
├── tools/            # MCP 工具層（AI 工具看到的介面）
├── browser/          # Playwright session 管理 + 頻率保險絲
├── platforms/        # 平台 adapter（流程邏輯）
└── extractors/       # selector 與 DOM 解析（Meta 改版只修這裡）
```

頻率保險絲：操作間隔 ≥ 5 秒、每小時 ≤ 60 次，超過直接報錯（見 `src/config.ts`）。

開發新功能（或修 Meta 改版）請照 [docs/WORKFLOW.md](docs/WORKFLOW.md) 的探測流程做。

## 授權

[MIT](LICENSE)
