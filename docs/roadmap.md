# 下一版可以做什麼

Phase 1–5 收工時，有四件事是**知道但刻意沒做**的。當初每一件都有理由：
它們都不影響「每天記一筆、月底看得懂」這個核心，而範圍一放大就會拖慢完成。

這份文件記的是**要動手時該從哪個檔案開始，以及會踩到哪條既有規則**。
`CLAUDE.md` 的「不可違反的規則」對這四件事都還有效，動手前先讀一次。

---

## 1. 搜尋與篩選只看得到當月

**現況**：[Transactions.tsx](../src/screens/Transactions.tsx) 先用
`listTransactionsByMonth(month)` 撈出當月的帳，再交給 `filterTransactions` 過濾。
所以在八月打「早餐」，七月的早餐一筆都不會出現。

**為什麼當初這樣做**：月份是這個 App 的主軸——上面的月結、趨勢圖、分類排行全都
以月為單位。讓清單跨月而上面三塊仍是單月，數字會對不起來，使用者無從判斷哪個是真的。

**從哪裡下手**：`repo.ts` 已經有 `listTransactionsBetween(startDate, endDate)`，
趨勢圖就是用它撈六個月的。所以資料層不必改，要決定的是**畫面語意**：

- 最小改法：`FilterBar` 有輸入關鍵字時才切換成跨月查詢，並在上方明確標示
  「搜尋全部」而不是當月——不能讓使用者以為那個總計還是八月的
- 大改法：篩選列加日期範圍，月份切換器變成範圍的一種預設值

**會踩到的地方**：`filterTransactions` 是純函式且與月份無關，跨月不必改它。
真正麻煩的是 `MonthSummary`、`TrendChart`、`CategoryRank` 三塊要跟著顯示什麼。

---

## 2. 自動產生的帳在清單裡看不出來

**現況**：定期支出確認後寫入的交易有 `recurringId`，
但 [Transactions.tsx](../src/screens/Transactions.tsx) 的 `Row` 沒有用到它。
房租那筆和手動記的午餐在畫面上長得一模一樣。

**為什麼當初這樣做**：它已經在確認清單裡被看過一次了，清單裡再標一次的價值不高，
而多一個標記就多一份視覺噪音。

**從哪裡下手**：資料早就存好了，只差 `Row` 裡加一個淡色的小標記（例如「定期」
兩個字或一個循環符號）。**不要用顏色區分**——顏色在這個 App 裡有專屬語意，
它只屬於分類，見 `CLAUDE.md` 的色盤規則。

順帶一提，`recurringId` 目前也沒有反向用途：刪掉一條規則不會影響已經產生的帳。
那是刻意的（帳已經花掉了），但若日後想做「這條規則總共花了多少」，
`recurringId` 就是現成的索引。

---

## 3. 分類不能新增、改名、封存

**現況**：`repo.ts` 只開放 `updateCategoryStyle(id, { emoji, color })`。
八個分類在 `seed.ts` 裡寫死，`archived` 欄位存在但沒有任何 UI 能改它。

**為什麼當初這樣做**，三個獨立的理由，每一個都夠擋下它：

1. **改名會竄改歷史**。交易只存 `categoryId`，把「飲食」改成「房租」，
   過去半年的午餐會全部變成房租。這條在 `CLAUDE.md` 裡是硬規則。
2. **新增會撞到色盤**。`palette.ts` 只有八個經過色盲驗證的色階，而且**不可循環套用**
   ——第 9 個分類自動生色幾乎必然與既有色相撞。`categoryColorAt()` 索引越界時
   是刻意丟例外的，不是忘了處理。
3. **id 必須是固定 slug**。換手機靠備份還原，新裝置會自己 seed 一份分類；
   id 若是隨機的，備份裡的 `categoryId` 全部對不上，整份報表會變成「未知分類」。

**從哪裡下手**：先決定第 9 個分類怎麼辦，這是整件事的前提。三條路：

- **只做封存**（最小、最安全）：`archived` 欄位已經有了，`listCategories` 已經會
  過濾。只要在設定頁加一個開關，並確認記帳畫面不再列出它、但歷史交易仍顯示得出名稱。
  **注意 `archived` 不能建索引**（IndexedDB 不接受布林鍵），要在 JS 端過濾。
- **允許新增但上限八個**：超過就明白拒絕，不要偷偷生色。
- **改用「其他」吸收**：超過八類時把最小的幾類 fold 成「其他」，圖表仍然只有八色。

新增分類時 id 要讓使用者自己出一個 slug，或用名稱轉拼音——**不要用
`crypto.randomUUID()`**，理由同上第 3 點。

---

## 4. 收入沒有分類排行

**現況**：`CategoryRank` 固定吃支出。

**為什麼當初這樣做**：收入通常只有「薪水」一筆，畫成排行是一根佔滿的長條，
資訊量是零。

**從哪裡下手**：這是四件事裡最便宜的一件。
`categoryBreakdown(rows, type)` 本來就吃 `type` 參數，傳 `'income'` 就有結果，
`CategoryRank` 也不必改。真正要想的是**畫面上放哪裡**——多一塊永遠只有一根長條的
區塊會讓明細頁變長。比較合理的做法是在 `MonthSummary` 點收入數字時才展開。

---

## 5. GitHub Pages 發布不了（唯一還沒解決的問題）

**這一項跟前四項不同：前四項是刻意不做，這一項是做了但沒成功。**

### 現況

線上網址 https://huangjohnny0213-gif.github.io/moneybook/ **是活的、可以裝、可以離線用**，
但它停在 `68f6a6d` 那一版。之後每一次 push 的內容都沒有上線。

線上那版缺的東西：`apple-mobile-web-app-capable` 與 `apple-mobile-web-app-title`
（commit `deb0db7`）。所以從主畫面開啟時**可能仍會帶著網址列**，
主畫面名稱會是被截斷的「記帳本」而不是「記帳」。

### 兩種部署方式都試過，都失敗

| 方式 | 現象 |
|---|---|
| `actions/deploy-pages`（官方推薦） | artifact 上傳成功、deployment 建得出來，但狀態永遠停在 `deployment_queued`，逾時為止都沒動過。只有最初那一次真的上線 |
| `gh-pages` 分支 + 傳統管線 | GitHub Actions 那一關**全綠**，分支上的 commit 也正確，但 Pages 自己的 build 跑了十分鐘後回 `Page build failed.`，沒有任何細節 |

兩條路都是「工單交出去了，發布的人沒做完」。九個檔案的靜態站要跑十分鐘才失敗，
不是正常的建置時間。所以問題**不在部署方式，也不在專案設定** ——
CI 的 lint／test／build 三關全綠，產出的 `dist` 在本機 `pnpm preview` 上驗過，
service worker 註冊正常、九個檔案進 precache、離線可用。

### 已知的一個人為因素

第一次 `gh repo create --push` 當下就觸發了 workflow，而 Pages 是在那之後才用 API
開的。第一次執行等於在跟站台初始化賽跑，很可能是這裡把這個站台弄壞的。
**正確順序是：先建 repo → 開好 Pages → 再 push。**

這解釋得了第一次，解釋不了後面每一次。

### 之後從哪裡下手（照順序試）

1. **重跑一次 build**（最便宜，先試）：
   `gh api -X POST repos/huangjohnny0213-gif/moneybook/pages/builds`，
   等兩分鐘後用 `gh api repos/.../pages/builds/latest` 看 `status`。
   `Page build failed.` 有可能只是當天的暫時狀況。
2. **到網頁的 Settings → Pages 手動切一次 source**（切成別的再切回 gh-pages）。
   用網頁 UI 走的初始化流程和 API 不完全一樣，有機會把卡住的狀態重設掉。
3. **刪掉 Pages 設定重來**：`gh api -X DELETE repos/.../pages`，
   然後**先**在網頁上開好 Pages、確認站台已經初始化，**再** push 觸發部署。
4. **最後手段：換一個 repo 名字重建**。如果問題是綁在這個站台上的，
   新站台就不會繼承。注意 `vite.config.ts` 的 `base` 寫死了 `/moneybook/`，
   換名字要跟著改，不然所有資源路徑都會 404。

### 怎麼確認到底有沒有上線

**不要相信 Actions 的綠燈或紅字**，它反映的是動作有沒有跑完，不是檔案有沒有換。
唯一可靠的檢查是直接抓線上的檔案比對：

```bash
curl -s https://huangjohnny0213-gif.github.io/moneybook/ | grep -c "apple-mobile-web-app-title"
```

回 `1` 就是新版上線了，回 `0` 就是還沒。這一課是這次踩出來的：
`actions/deploy-pages` 逾時報的是「timeout」，**不會告訴你檔案其實沒換** ——
會讓人以為部署好了。

### 在修好之前怎麼更新手機上的 App

沒有辦法。線上是哪一版，手機上就是哪一版。
本機改的東西要驗證，用 `pnpm dev --host 0.0.0.0` 讓手機連進來看
（但那是 HTTP，裝不了 PWA，只能看版面）。

---

## 動手前的提醒

- 三個指令都要跑完才算完成：`pnpm test`、`pnpm lint`、`pnpm build`。
  `test` 全綠不代表編得過，型別錯誤只有 `tsc -b` 抓得到。
- 純邏輯先寫測試（金額、日期、聚合、篩選），UI 元件不強制。
- 改到會影響備份檔結構的東西時，`backup.ts` 的 `BACKUP_VERSION` 要進版，
  並讓 `parseBackup` 知道怎麼讀舊檔——欄位當初就是為了這天留的。
