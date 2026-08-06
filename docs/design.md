# 個人記帳 PWA（iPhone 自用）— 實作計畫

## Context

使用者想要一個在 iPhone 上使用的記帳軟體，**純個人自用、不打算上架**。

現況：`~/linebot` 只有一個空的 `venv`，等於全新開始。開發機是 Windows 11 + WSL Ubuntu，**沒有 Mac**，因此無法編譯或簽章原生 iOS App（免費 Apple ID 簽的 App 每 7 天失效，一年期需 $99 美元/年）。

解法是做 **PWA**：一個純靜態網頁，在 iPhone Safari 用「加入主畫面」安裝後即為全螢幕、有 icon、可離線的類原生 App，免簽章、免上架、免年費、改版即時生效。

已確認的需求決策：

| 項目 | 決定 |
|---|---|
| 形式 | PWA（加入主畫面） |
| 資料儲存 | **純本機 IndexedDB**，無後端、無登入、無帳號 |
| 備份 | 手動匯出（但 App 要主動提醒） |
| 記帳目的 | **事後分析錢花到哪** → 主畫面以分類佔比與趨勢為核心，不強制預算 |
| 功能範圍 | 支出 **＋ 收入**；**固定/定期支出** |
| 不做 | 帳戶/付款方式區分、收據拍照、多幣別、預算超支警示 |
| 定期支出行為 | **開 App 時跳出待確認清單**，按確認才記入，可當場改金額或跳過 |
| 部署 | **GitHub Pages**（public repo，免費 + HTTPS） |
| 專案位置 | **新建 `~/moneybook`**，不動現有 `~/linebot` |

預期成果：每天能在 3 秒內記一筆帳，月底能一眼看出錢花在哪，且資料不會莫名消失。

環境已驗證：WSL 內 `node v22.22.1`、`npm 11.12.1`、`git 2.53.0`。**`gh` CLI 未安裝**，最後建 GitHub repo 需用網頁介面手動建立後 `git remote add`。

---

## 技術選型

| 層 | 選擇 | 理由 |
|---|---|---|
| 建置 | Vite + React + TypeScript | 型別能擋掉金額/日期的低級錯誤 |
| 資料層 | Dexie.js（IndexedDB 封裝） | 原生 IndexedDB API 過於囉嗦 |
| PWA | `vite-plugin-pwa` | 自動產生 service worker + manifest |
| 樣式 | Tailwind CSS v4（`@tailwindcss/vite`） | 小專案迭代最快 |
| 圖表 | Recharts | 圓餅圖/柱狀圖現成 |
| 測試 | Vitest + `fake-indexeddb` | 只測會算錯錢的邏輯 |
| 部署 | GitHub Actions → GitHub Pages | push 即上線 |

**開發流程遵循 TDD**（`superpowers:test-driven-development`）：純函式邏輯（金額換算、月份聚合、定期支出到期判定、CSV 匯出）一律先寫測試。UI 元件不強制測試。
**畫圖表前先讀 `dataviz` skill**，統一配色與座標軸規範。

---

## 關鍵設計決策（實作時務必遵守）

### 1. 金額一律用「整數分」儲存

欄位名 `amountMinor: number`，存 `12050` 代表 `120.50`。
理由：`0.1 + 0.2 !== 0.3`，浮點數存錢累積數百筆後月總計會出現一元誤差。
需要一組轉換工具（`src/lib/money.ts`）：`toMinor(str) / fromMinor(n) / formatTWD(n)`，且**只有這個檔案能做除以 100 的動作**。

### 2. 定期支出用「開 App 回補」，且必須冪等

手機 PWA 關閉時無法執行背景程式，所以策略是每次開 App 檢查規則。
- 每條規則存 `lastGeneratedMonth: 'YYYY-MM'`，作為防重複的鎖。
- 從 `lastGeneratedMonth` 補到當月，產生**待確認項目**（不直接寫入 transactions）。
- 使用者確認後才寫入 `transactions` 並更新 `lastGeneratedMonth`；「跳過」也要更新，否則下次又跳出來。
- **`dayOfMonth: 31` 碰到 2 月必須夾到當月最後一天**，直接 `new Date(2026, 1, 31)` 會默默溢位到 3 月 3 日。
- 開三次 App 不能記三次房租 —— 這是必寫的測試案例。

### 3. 分類用封存而非刪除

`categories.archived: boolean`。直接刪除會讓歷史交易變成孤兒，報表出現「未知分類」。封存後不出現在輸入畫面，但舊帳仍能正確顯示。

### 4. iOS 匯出必須走 Web Share API

iOS Safari 對 `<a download>` 支援很差，常直接開新分頁顯示 JSON 而非存檔。
正確順序：`navigator.share({ files: [File] })` → 失敗才 fallback 到 `<a download>`。
這樣才能存進「檔案」App / iCloud 雲碟。

### 5. 匯入用 id 合併，不覆蓋

以 `transaction.id` 比對：已存在則跳過（或以 `updatedAt` 較新者為準），不存在才插入。
避免匯入舊備份時清空近期帳目。匯入前顯示「將新增 N 筆 / 略過 M 筆」讓使用者確認。

### 6. 備份提醒

`settings` 記錄 `lastBackupAt` 與 `txCountSinceBackup`。
距上次備份 > 30 天 **或** 新增 > 50 筆時，首頁頂端顯示提醒橫幅。純本機儲存沒有第二道防線，這個提醒是唯一的保險。

### 7. iOS PWA 實作細節（不做會很明顯出錯）

- `manifest`：`display: standalone`、`theme_color`、`background_color`，並在 HTML 補 `apple-touch-icon`（iOS 不完全吃 manifest 的 icons）。
- `<meta name="viewport" content="... viewport-fit=cover">` + CSS `env(safe-area-inset-bottom)`，否則底部按鈕會被 home indicator 蓋住。
- 所有 `<input>` 的 `font-size >= 16px`，否則 iOS 聚焦時會自動放大整個畫面且縮不回去。
- 記帳畫面用**自製數字鍵盤**（非 `<input type=number>`），避免系統鍵盤彈跳與版面跳動。
- `overscroll-behavior: none` 消除橡皮筋效果。
- Service worker 更新後顯示「有新版本，點此重新載入」，否則會一直用舊快取。

---

## 資料模型（`src/db/schema.ts`）

```ts
type TxType = 'expense' | 'income';

interface Transaction {
  id: string;              // crypto.randomUUID()
  type: TxType;
  amountMinor: number;     // 整數分
  date: string;            // 'YYYY-MM-DD'（本地日期，非 ISO timestamp）
  categoryId: string;
  note: string;
  recurringId?: string;    // 由哪條定期規則產生
  createdAt: number;
  updatedAt: number;
}

interface Category {
  id: string;
  name: string;
  type: TxType;
  emoji: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

interface RecurringRule {
  id: string;
  type: TxType;
  amountMinor: number;
  categoryId: string;
  note: string;
  dayOfMonth: number;          // 1-31，超過當月天數則夾到月底
  startDate: string;           // 'YYYY-MM-DD'
  endDate?: string;
  active: boolean;
  lastGeneratedMonth: string;  // 'YYYY-MM'，冪等鎖
}

interface Settings {           // 單列，id 固定為 'app'
  id: 'app';
  lastBackupAt: number | null;
  txCountSinceBackup: number;
}
```

Dexie 索引：`transactions: 'id, date, categoryId, type, [date+type]'`。

---

## 檔案結構

```
~/moneybook/
├── index.html
├── vite.config.ts            # react + tailwind + PWA plugin，base 設為 '/moneybook/'
├── package.json
├── public/
│   ├── icon-192.png / icon-512.png / apple-touch-icon.png
├── .github/workflows/deploy.yml
└── src/
    ├── main.tsx / App.tsx     # 路由與底部 tab bar
    ├── db/
    │   ├── schema.ts          # 型別 + Dexie 定義
    │   ├── seed.ts            # 預設分類（← 需使用者提供，見下）
    │   └── repo.ts            # 所有讀寫的唯一入口
    ├── lib/
    │   ├── money.ts           # 分/元轉換與格式化（唯一能 /100 的地方）
    │   ├── dates.ts           # 月份工具、clampDayOfMonth
    │   ├── recurring.ts       # 到期判定與展開（← 核心邏輯，見下）
    │   ├── stats.ts           # 月度聚合、分類佔比、趨勢
    │   └── backup.ts          # JSON/CSV 匯出匯入 + Web Share
    ├── screens/
    │   ├── Overview.tsx       # 首頁：本月收支、圓餅、最近 5 筆、備份提醒
    │   ├── AddEntry.tsx       # 數字鍵盤 + 分類九宮格 + 日期 + 備註
    │   ├── Transactions.tsx   # 依日期分組、搜尋、篩選
    │   ├── Reports.tsx        # 月切換、分類排行、近 6 月趨勢
    │   └── SettingsScreen.tsx # 分類管理、定期規則、匯出匯入
    └── components/
        ├── NumericKeypad.tsx
        ├── CategoryPicker.tsx
        ├── RecurringConfirmSheet.tsx
        └── BackupReminder.tsx
```

---

## 實作階段

每階段結束時 App 都應該是能跑、能用的。

**Phase 1 — 能記帳的最小版本**
專案初始化、Dexie schema、`money.ts`（含測試）、預設分類 seed、`AddEntry` 畫面、`Transactions` 列表、底部 tab。
驗收：能新增、看到、編輯、刪除一筆帳；重開瀏覽器資料還在。

**Phase 2 — 看得懂錢花去哪**
`stats.ts`（含測試）、`Overview` 首頁、`Reports` 報表（圓餅 + 近 6 月趨勢）、`Transactions` 的搜尋與篩選。
驗收：造 30 筆假資料，圓餅百分比加總為 100%，月切換數字正確。

**Phase 3 — 定期支出**
`recurring.ts`（含測試，涵蓋 2 月夾月底與重複開啟冪等）、設定頁的規則 CRUD、開 App 時的待確認 sheet。
驗收：設一條 31 號規則，把系統時間推到 3 月，應補出 1/31、2/28、3/31 三筆待確認且不重複。

**Phase 4 — 備份**
`backup.ts`（含測試）、JSON/CSV 匯出、Web Share 優先、匯入合併與預覽、備份提醒橫幅。
驗收：匯出後清空 IndexedDB，匯入還原，筆數與總額完全一致；連續匯入兩次不會變兩倍。

**Phase 5 — PWA 與部署**
manifest、icons、safe-area、16px 輸入、service worker 更新提示、GitHub Actions 部署到 Pages。
驗收：iPhone Safari 開啟網址 → 加入主畫面 → 開啟後無網址列 → **開飛航模式仍能記帳**。

---

## 需要你親手寫的部分（Learning Mode）

這兩處有真實的取捨或依賴你的個人習慣，我會先把周邊搭好、留下函式簽名與 TODO 註解：

1. **`src/db/seed.ts` 的預設分類清單** — 只有你知道自己的錢實際花在哪些地方。分類太細會懶得選，太粗看不出所以然；建議支出 8-12 類。這直接決定報表有沒有用。
2. **`src/lib/recurring.ts` 的 `expandDueRules()`** — 給定規則與今天，回傳待確認清單。取捨在於：規則停用很久後重新啟用，是要一次補齊所有欠缺的月份（帳目完整但可能一次跳出 10 筆），還是只補最近一個月（清爽但有缺漏）。

---

## 驗證方式

```bash
# 開發
cd ~/moneybook && npm run dev -- --host    # --host 才能用手機連進來測

# 測試
npm test

# 建置檢查
npm run build && npm run preview
```

**手機實測（Phase 5 必做，模擬器測不出來）：**
1. 手機與電腦同一 Wi-Fi，開 `http://<WSL-IP>:5173` 確認版面（此階段還不能裝 PWA，因為非 HTTPS）
2. 部署到 GitHub Pages 後用 Safari 開啟 → 分享 → 加入主畫面
3. 從主畫面 icon 開啟，確認：無網址列、底部按鈕沒被 home indicator 蓋住、點輸入框畫面不放大
4. **開飛航模式**，確認仍能記帳與看報表
5. 匯出備份，確認能存進「檔案」App

> WSL 的 IP 用 `wsl hostname -I` 取得。若手機連不上，需在 Windows 執行 `netsh interface portproxy` 或改用 Vite 的 `--host 0.0.0.0` 搭配防火牆放行。

---

## 已知限制（接受，不解決）

- 資料只在這支手機上。換手機必須靠匯出的備份檔還原。
- 刪掉主畫面 icon 或重置 Safari 資料會清空資料庫，且 iCloud 備份救不回來 → 這就是備份提醒存在的理由。
- 沒有多裝置同步。若日後需要，架構上的擴充點是在 `repo.ts` 之後加一層同步層，不必動畫面。
