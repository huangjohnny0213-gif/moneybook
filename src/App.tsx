import { useEffect, useState } from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import { AddEntry } from './screens/AddEntry'
import { Settings } from './screens/Settings'
import { Transactions } from './screens/Transactions'
import { seedCategoriesIfEmpty } from './db/seed'

const TABS = [
  { id: 'add', label: '記帳', Screen: AddEntry },
  { id: 'list', label: '明細', Screen: Transactions },
  { id: 'settings', label: '設定', Screen: Settings },
] as const

type TabId = (typeof TABS)[number]['id']

/**
 * App 外框。
 *
 * 沒有引入路由套件：裝成主畫面後是全螢幕、看不到網址列，也不需要深連結，
 * 一個 state 就夠了。
 */
export default function App() {
  const [tab, setTab] = useState<TabId>('add')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // 每次開 App 都呼叫，但只在資料庫還沒有分類時才真的寫入。
    seedCategoriesIfEmpty().then(() => setReady(true))
  }, [])

  const Screen = TABS.find((item) => item.id === tab)!.Screen

  return (
    <ThemeProvider>
      {/* pt 補的是瀏海／狀態列。裝成主畫面後畫面會延伸到它底下，
          不補的話最上面一排控制項會被時間與訊號格蓋住。 */}
      <div className="mx-auto flex h-[100svh] max-w-[430px] flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        <main className="min-h-0 flex-1">{ready && <Screen />}</main>

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
              className={`flex-1 py-3 text-sm ${
                tab === item.id ? 'font-semibold text-ink' : 'text-ink-3'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </ThemeProvider>
  )
}
