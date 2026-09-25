# moneybook

自用的記帳 PWA。在 iPhone Safari 開啟後「加入主畫面」，就是一個全螢幕、
可離線、免上架也免年費的記帳 App。

**沒有後端、沒有登入、沒有帳號。** 所有資料只存在你自己那支手機的 IndexedDB 裡，
不會經過任何第三方伺服器 —— 也因此換手機或重置 Safari 資料時，只能靠手動匯出的備份檔還原。
App 裡的備份提醒就是為了這件事存在的。

## 功能

- 自製數字鍵盤記帳，支出與收入
- 月結、六個月趨勢、分類佔比排行
- 定期支出：開 App 時列出到期項目，確認後才記入
- 備份：JSON（可還原）與 CSV（給試算表看，不能還原）
- 郵局通知匯入（選配）：透過你自己 Google 帳號裡的 Apps Script 讀郵局扣款通知信，
  列成待確認，選好分類才入帳。設定方式見 [docs/mail-import.md](docs/mail-import.md)
- 深色模式，跟隨系統或手動指定

## 開發

```bash
pnpm install
pnpm dev --host 0.0.0.0   # --host 才能用手機連進來測
pnpm test                  # vitest
pnpm lint                  # oxlint
pnpm build                 # tsc -b && vite build
pnpm icons                 # 重新產生 PWA 的 icon
```

push 到 `main` 會由 GitHub Actions 跑完 lint／test／build 後自動部署到 Pages。

設計決策與各階段的實作紀錄見 [docs/design.md](docs/design.md)，
下一版可以從哪裡下手見 [docs/roadmap.md](docs/roadmap.md)。
