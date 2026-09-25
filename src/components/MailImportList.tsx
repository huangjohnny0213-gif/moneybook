import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTheme } from './themeContext'
import { formatDayLabel } from '../lib/dates'
import { categoryGlyph } from '../lib/glyph'
import { formatAmount } from '../lib/money'
import {
  confirmMailImport,
  dismissMailImport,
  listImportCategoryHints,
} from '../db/repo'
import type { Category, MailImport } from '../db/schema'

interface Props {
  items: MailImport[]
  /** 可選的支出分類，已封存的不含。 */
  categories: Category[]
}

/**
 * 郵局通知抓回來、等使用者確認的付款。
 *
 * 和 DueList 一樣不直接入帳：LINE Pay 的信裡沒有店名，分類只有使用者知道；
 * 轉帳可能是轉給自己的另一個帳戶，繳費可能是繳已經記過的卡費。
 * 刻意沒有「全部確認」—— 每一筆的分類都得各自選。
 */
export function MailImportList({ items, categories }: Props) {
  const hints = useLiveQuery(
    listImportCategoryHints,
    [],
    new Map<string, string>(),
  )

  if (items.length === 0) return null

  return (
    <section>
      <h2 className="flex items-center gap-2 bg-key px-4 py-1.5 text-xs font-medium text-ink-2">
        郵局通知待確認
        <span className="rounded-full bg-[#d03b3b] px-1.5 text-[10px] text-white tabular-nums">
          {items.length}
        </span>
      </h2>

      {items.map((item) => (
        <ImportRow
          key={item.id}
          item={item}
          categories={categories}
          hint={hints.get(item.label)}
        />
      ))}
    </section>
  )
}

function ImportRow({
  item,
  categories,
  hint,
}: {
  item: MailImport
  categories: Category[]
  hint: string | undefined
}) {
  const { seriesColor } = useTheme()
  // 預設值是衍生出來的，不塞進 state 的初始值：hints 是非同步讀的，
  // 第一次渲染時還是空的，塞進初始值就永遠等不到它。
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hinted = categories.some((c) => c.id === hint) ? hint : undefined
  const selected = picked ?? hinted ?? ''

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-hairline px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{item.label}</span>
          <span className="block text-xs text-ink-3">
            {formatDayLabel(item.date)}
          </span>
        </span>
        <span className="shrink-0 text-base font-medium tabular-nums">
          -{formatAmount(item.amountMinor)}
        </span>
      </div>

      <div
        role="group"
        aria-label={`${item.label} 的分類`}
        className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1"
      >
        {categories.map((category) => {
          const on = category.id === selected
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setPicked(category.id)}
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

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => run(() => dismissMailImport(item.id))}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-2 active:bg-key disabled:opacity-40"
        >
          略過
        </button>
        <button
          type="button"
          onClick={() => run(() => confirmMailImport(item.id, selected))}
          disabled={busy || selected === ''}
          className="rounded-lg bg-ink px-4 py-1.5 text-sm font-semibold text-surface disabled:opacity-40"
        >
          確認
        </button>
      </div>
    </div>
  )
}
