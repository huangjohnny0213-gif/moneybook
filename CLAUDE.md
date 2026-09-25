# moneybook

iPhone 自用的記帳 PWA。純本機 IndexedDB，無後端、無登入、無帳號，
靠手動匯出備份。完整設計與實作階段見 [docs/design.md](docs/design.md)。

唯一會連網路的是選配的郵局通知匯入：App 去問使用者自己 Google 帳號裡的
Apps Script（`apps-script/Code.gs`），設定方式見 [docs/mail-import.md](docs/mail-import.md)。

## 指令

開發機是 Windows 11 + WSL Ubuntu，專案在 WSL 的 `~/moneybook`。

```bash
/home/huang/.local/share/pnpm/pnpm test     # vitest
/home/huang/.local/share/pnpm/pnpm lint     # oxlint
/home/huang/.local/share/pnpm/pnpm build    # tsc -b && vite build
/home/huang/.local/share/pnpm/pnpm dev --host 0.0.0.0   # --host 才能用手機連進來測
```

**pnpm 一定要用絕對路徑。** WSL 裡沒有 Linux 版的 node 工具鏈，直接打 `npm` 或 `npx`
會指到 Windows 的 `C:\Program Files\nodejs`，曾經因此把專案建到 `C:\Windows\`。
`PATH` 的 export 在 `bash -lc` 裡不會生效，corepack 也是壞的
（`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`）。

## 環境地雷

**從 Windows 呼叫 WSL 時不要用 `$(...)` 或 `$var`。**
`wsl.exe -d Ubuntu -- bash -lc '...'` 的單引號擋不住 Windows 端 Git Bash 的展開，
變數會先在 Windows 側求值（通常是空字串）再送進 WSL。症狀是指令看起來成功但輸出是空的。
需要迴圈就把腳本寫成檔案。多行字串用 heredoc 沒問題，heredoc 的內容不受影響。

**IDE 的 TypeScript 診斷會誤報找不到模組。** Windows 的 TS server 讀不到 WSL 的
`node_modules`。一律以 `pnpm build` 的實際輸出為準。

**`pnpm test` 全綠不代表編譯得過。** vitest 不做型別檢查，只有 `tsc -b` 會抓到
型別錯誤。收工前三個都要跑：`test`、`lint`、`build`。

## 測試

**碰 IndexedDB 時不能用裸的 `vi.useFakeTimers()`。** 會凍住 fake-indexeddb 用來推進
交易的計時器，導致測試逾時。要寫 `vi.useFakeTimers({ toFake: ['Date'] })`。

純函式邏輯（金額、日期、鍵盤輸入、配色）一律先寫測試；UI 元件不強制。

## 不可違反的規則

**金額一律存整數分**（`amountMinor`，`12050` 代表 `120.50`）。
`src/lib/money.ts` 是全專案唯一能做 100 倍換算的檔案。浮點數存錢累積數百筆後
月總計會出現一元誤差。

**`src/lib/` 不可以 import `src/db/`。** 領域型別放 `src/types.ts`，
需要結構型別時在 lib 裡自己宣告介面，不要從 `db/schema.ts` 拉 `Category` 進來。

**Dexie 的 `stores()` 不可以索引布林欄位**（`archived`、`active`）。
IndexedDB 不接受布林值當索引鍵，寫進去不報錯但查不到。這些表都很小，在 JS 端過濾即可。

**分類色盤不可重排、不可循環套用。** `src/lib/palette.ts` 的八個色階順序本身
就是色盲安全的驗證結果。第 9 個分類不能自動生色（幾乎必然與既有色相撞），
要 fold 成「其他」或改用小倍數圖。`categoryColorAt()` 索引越界時刻意丟例外。

**顏色跟著分類本身走，不跟著它在清單裡的名次走。** 顏色在 seed 當下就寫成具體 hex
存進資料庫，不在渲染時依索引計算——否則封存一類會讓後面每一類的顏色往前遞補、整片重新著色。

**分類的 id 用固定英文 slug，不用 `crypto.randomUUID()`。** 換手機時靠備份還原，
新裝置會 seed 出自己的一份分類；id 若是隨機的，備份裡的 `categoryId` 會全部對不上，
還原後整份報表變成「未知分類」。

**`seedCategoriesIfEmpty()` 的條件是「表為空」，不是逐筆檢查。**
逐筆檢查會把使用者刪掉或封存的分類每次開 App 都塞回來。

**分類只開放改 emoji 與顏色，不開放改名稱。** 歷史交易只存 `categoryId`，
把「飲食」改成「房租」會讓過去半年的午餐全部變成房租。

**郵件匯入永遠是選配。** 沒設定、沒網路、Apps Script 壞掉時，App 其餘部分必須照常運作。
同步失敗只記進 `settings.mailSyncError` 讓設定頁顯示，不擋任何畫面。

**匯入的付款不可以自動入帳。** 一律進待確認清單，使用者選分類後才寫成交易。
LINE Pay 的郵局通知信沒有店名，猜錯分類比沒記更難查。

**信件解析放在 `src/lib/postalMail.ts`，不放 Apps Script。** `Code.gs` 只找信、原封不動交出去。
Apps Script 部署在使用者的 Google 帳號裡，改一次要他自己重新部署。

**Apps Script 的網址與密碼不進備份檔。** 那是讀信箱的鑰匙，不該跟著備份檔到處走。

**測試裡的信件內容一律捏造。** 這個 repo 是公開的，帳號、交易編號、附言都不能用真的。

## iOS / PWA

- `viewport-fit=cover` 搭配 `env(safe-area-inset-top/bottom)`，
  否則狀態列與 home indicator 會蓋住最上下兩排控制項
- 所有輸入元素 `font-size >= 16px`，小於這個值 iOS 聚焦時會自動放大且縮不回去
- 金額用自製數字鍵盤，不用 `<input type="number">`，避免系統鍵盤把版面頂上頂下
- `overscroll-behavior: none` 消掉橡皮筋回彈
- 匯出必須先試 `navigator.share({ files })` 再 fallback 到 `<a download>`，
  iOS Safari 對後者支援很差，常直接開新分頁顯示 JSON

## 慣例

- 使用者用繁體中文溝通，註解與 commit 訊息也用繁體中文
- 註解寫「為什麼」而不是「做什麼」，尤其是繞過某個坑的地方
- 不引入網頁字型與 icon set：這是離線優先的 PWA，兩者都是快取負擔
