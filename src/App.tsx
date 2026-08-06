import { useEffect, useState } from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import { useDueItems } from './components/useDueItems'
import { AddEntry } from './screens/AddEntry'
import { Settings } from './screens/Settings'
import { Transactions } from './screens/Transactions'
import { seedCategoriesIfEmpty } from './db/seed'

const TABS = [
  { id: 'add', label: '記帳' },
  { id: 'list', label: '明細' },
  { id: 'settings', label: '設定' },
] as const

type TabId = (typeof TABS)[number]['id']

/**
 * App 外框。
 *
 * 沒有引入路由套件：裝成主畫面後是全螢幕、看不到網址列，也不需要深連結，
 * 一個 state 就夠了。
 */
export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  )
}

/**
 * 外框本體。
 *
 * 與 App 分開是因為紅點要用到 useDueItems，而那個 hook 讀主題以外的資料時
 * 仍需要活在 ThemeProvider 之內（DueList 會用到 seriesColor）。
 */
function Shell() {
  const [tab, setTab] = useState<TabId>('add')
  const [ready, setReady] = useState(false)
  const dueCount = useDueItems().length

  useEffect(() => {
    // 每次開 App 都呼叫，但只在資料庫還沒有分類時才真的寫入。
    seedCategoriesIfEmpty().then(() => setReady(true))
  }, [])

  return (
    <>
      {/* pt 補的是瀏海／狀態列。裝成主畫面後畫面會延伸到它底下，
          不補的話最上面一排控制項會被時間與訊號格蓋住。 */}
      <div className="mx-auto flex h-[100svh] max-w-[430px] flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        {/* 明確列出而不是查表：明細頁需要一個切到設定頁的回呼，
            查表的寫法會逼所有畫面都接受同一組 props。 */}
        <main className="min-h-0 flex-1">
          {ready && tab === 'add' && <AddEntry />}
          {ready && tab === 'list' && (
            <Transactions onGoToBackup={() => setTab('settings')} />
          )}
          {ready && tab === 'settings' && <Settings />}
        </main>

        <nav
          // env(safe-area-inset-bottom) 把 home indicator 的高度補回來，
          // 沒有它最底下那排按鈕會被那條橫槓蓋住。
          className="flex border-t border-hairline bg-raised pb-[env(safe-area-inset-bottom)]"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`relative flex-1 py-3 text-sm ${
                tab === item.id ? 'font-semibold text-ink' : 'text-ink-3'
              }`}
            >
              {item.label}
              {item.id === 'settings' && dueCount > 0 && (
                // 紅點靠 aria-label 補上語意，否則螢幕閱讀器只會唸到「設定」，
                // 完全不知道有東西待處理。
                <span
                  aria-label={`有 ${dueCount} 筆定期支出待確認`}
                  role="status"
                  className="absolute top-2 ml-1 h-2 w-2 rounded-full bg-[#d03b3b]"
                />
              )}
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}
