import { useTheme } from '../components/themeContext'
import type { ThemePref } from '../lib/theme'
import { CategoryStyle } from './CategoryStyle'

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
]

/** 設定頁。目前只有外觀與分類，之後的定期支出規則與備份匯出也會放進來。 */
export function Settings() {
  const { pref, setPref } = useTheme()

  return (
    <div className="h-full overflow-y-auto">
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
