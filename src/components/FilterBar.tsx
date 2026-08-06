import { categoryGlyph } from '../lib/glyph'
import type { Filter } from '../lib/stats'
import type { Category } from '../db/schema'
import type { TxType } from '../types'
import { useTheme } from './themeContext'

interface Props {
  filter: Filter
  categories: Category[]
  onChange: (filter: Filter) => void
}

const TYPES: { value: TxType | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
]

/**
 * 搜尋與篩選。
 *
 * 篩選狀態刻意不進資料庫：下次開 App 應該看到完整的帳，
 * 而不是上次忘了清掉的篩選條件 —— 那會讓人以為帳不見了。
 */
export function FilterBar({ filter, categories, onChange }: Props) {
  const { seriesColor } = useTheme()

  function toggleCategory(id: string) {
    const next = filter.categoryIds.includes(id)
      ? filter.categoryIds.filter((c) => c !== id)
      : [...filter.categoryIds, id]
    onChange({ ...filter, categoryIds: next })
  }

  const active =
    filter.query !== '' || filter.type !== 'all' || filter.categoryIds.length > 0

  return (
    <div className="border-b border-hairline px-4 py-2.5">
      <div className="flex gap-2">
        <input
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
          // search 型別在 iOS 上會給一個原生的清除叉叉，不必自己畫
          type="search"
          placeholder="搜尋備註或分類"
          aria-label="搜尋"
          className="min-w-0 flex-1 rounded-lg bg-key px-3 py-2 placeholder:text-ink-3"
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange({ query: '', type: 'all', categoryIds: [] })}
            className="shrink-0 rounded-lg px-3 text-sm text-ink-2 active:bg-key"
          >
            清除
          </button>
        )}
      </div>

      <div className="mt-2 flex gap-1">
        {TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange({ ...filter, type: option.value })}
            aria-pressed={filter.type === option.value}
            className={`rounded-full px-3 py-1 text-xs ${
              filter.type === option.value
                ? 'bg-ink text-surface'
                : 'bg-key text-ink-2'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 橫向捲動而非換行：分類數量固定，換行會讓這一區的高度忽高忽低。 */}
      <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {categories.map((category) => {
          const on = filter.categoryIds.includes(category.id)
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleCategory(category.id)}
              aria-pressed={on}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs"
              style={
                on
                  ? { background: seriesColor(category.color), color: '#fff' }
                  : { background: 'var(--key)', color: 'var(--ink-2)' }
              }
            >
              {categoryGlyph(category)} {category.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
