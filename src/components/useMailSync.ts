import { useEffect } from 'react'
import { syncMailImports } from '../db/mailSync'

/** 兩次自動同步至少隔這麼久。切 App 來回切很頻繁，每次都打一次 Apps Script 沒有意義。 */
const MIN_INTERVAL_MS = 60_000

// 放在模組層而不是 ref：開發模式下 StrictMode 會把 effect 跑兩次，
// 狀態跟著元件走的話第一次打開就會連發兩個請求。
let lastStartedAt = 0
let running = false

/**
 * 開 App 與切回前景時同步郵局通知。
 *
 * 手機 PWA 關掉之後不能在背景執行，所以沒有「收到信就同步」這回事，
 * 只能在使用者回到 App 的那一刻去問。沒設定網址時 syncMailImports 自己會直接返回。
 */
export function useMailSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    function run() {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      const now = Date.now()
      if (running || now - lastStartedAt < MIN_INTERVAL_MS) return

      lastStartedAt = now
      running = true
      // 失敗原因已經存進設定、由設定頁顯示；這裡是背景觸發，沒有人在等結果。
      syncMailImports()
        .catch(() => {})
        .finally(() => {
          running = false
        })
    }

    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [enabled])
}
