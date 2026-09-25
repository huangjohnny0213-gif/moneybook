import { useLiveQuery } from 'dexie-react-hooks'
import { BackupPanel } from '../components/BackupPanel'
import { DueList } from '../components/DueList'
import { MailBridgePanel } from '../components/MailBridgePanel'
import { MailImportList } from '../components/MailImportList'
import { RecurringRules } from '../components/RecurringRules'
import { useDueItems } from '../components/useDueItems'
import { usePendingImports } from '../components/usePendingImports'
import { useTheme } from '../components/themeContext'
import type { ThemePref } from '../lib/theme'
import { listAllCategories } from '../db/repo'
import type { Category } from '../db/schema'
import { CategoryStyle } from './CategoryStyle'

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
]

/**
 * 設定頁。
 *
 * 區塊順序是刻意的：兩種待確認排在最上面，那是唯一需要使用者採取行動的東西，
 * 其餘都是設好就不太會再動的偏好。
 */
export function Settings() {
  const { pref, setPref } = useTheme()
  const dueItems = useDueItems()
  const pendingImports = usePendingImports()
  const categories = useLiveQuery(listAllCategories, [], [] as Category[])
  const byId = new Map(categories.map((c) => [c.id, c]))

  return (
    <div className="h-full overflow-y-auto">
      <DueList items={dueItems} categories={byId} />
      <MailImportList
        items={pendingImports}
        categories={categories.filter((c) => c.type === 'expense' && !c.archived)}
      />

      {/* 備份排在規則設定之前：資料遺失是不可逆的，優先級高於偏好設定。 */}
      <BackupPanel />

      <RecurringRules />

      <MailBridgePanel />

      <section>
        <h2 className="bg-key px-4 py-1.5 text-xs font-medium text-ink-2">
          外觀
        </h2>
        <div className="flex gap-1 px-4 py-3">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPref(option.value)}
              aria-pressed={pref === option.value}
              className={`flex-1 rounded-lg py-2 text-sm ${
                pref === option.value
                  ? 'bg-ink font-medium text-surface'
                  : 'bg-key text-ink-2'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="bg-key px-4 py-1.5 text-xs font-medium text-ink-2">
          分類
        </h2>
        <CategoryStyle />
      </section>
    </div>
  )
}
