import { useState } from 'react'
import { useTheme } from './themeContext'
import { formatDayLabel } from '../lib/dates'
import { categoryGlyph } from '../lib/glyph'
import { formatAmount, toMinor } from '../lib/money'
import type { DueItem } from '../lib/recurring'
import { confirmDueItem, skipDueItem } from '../db/repo'
import type { Category } from '../db/schema'

interface Props {
  items: DueItem[]
  categories: Map<string, Category>
}

/**
 * 待確認的定期帳。
 *
 * 定期支出不直接寫進資料庫，一律等使用者確認 —— 房租可能調漲、這個月可能
 * 根本沒扣款，自動記帳記錯了比沒記還難查。
 */
export function DueList({ items, categories }: Props) {
  const [busy, setBusy] = useState(false)

  if (items.length === 0) return null

  async function confirmAll() {
    // 一次補出很多筆時逐一點確認很煩，但仍然照順序一筆一筆寫，
    // 每一筆都要各自推進自己那條規則的鎖。
    setBusy(true)
    try {
      for (const item of items) await confirmDueItem(item, item.amountMinor)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 bg-key px-4 py-1.5 text-xs font-medium text-ink-2">
        待確認
        <span className="rounded-full bg-[#d03b3b] px-1.5 text-[10px] text-white tabular-nums">
          {items.length}
        </span>
      </h2>

      {items.map((item) => (
        <DueRow
          key={`${item.ruleId}-${item.month}`}
          item={item}
          category={categories.get(item.categoryId)}
          disabled={busy}
        />
      ))}

      {items.length > 1 && (
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={confirmAll}
            disabled={busy}
            className="w-full rounded-lg bg-ink py-2 text-sm font-semibold text-surface disabled:opacity-40"
          >
            全部確認（{items.length} 筆）
          </button>
          {/* 刻意沒有「全部跳過」：跳過會讓帳目缺一塊，該逐筆決定。 */}
        </div>
      )}
    </section>
  )
}

function DueRow({
  item,
  category,
  disabled,
}: {
  item: DueItem
  category: Category | undefined
  disabled: boolean
}) {
  // 水電費這類每月數字都不同，確認時要能當場改。
  const [amount, setAmount] = useState(() =>
    formatAmount(item.amountMinor).replace(/,/g, ''),
  )
  const { seriesColor } = useTheme()
  const amountMinor = toMinor(amount)

  return (
    <div className="border-b border-hairline px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm text-white"
          style={{
            background: category ? seriesColor(category.color) : 'var(--ink-3)',
          }}
        >
          {category ? categoryGlyph(category) : '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">
            {item.note || category?.name || '定期支出'}
          </span>
          <span className="block text-xs text-ink-3">
            {formatDayLabel(item.date)}
          </span>
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label={`${item.note} 的金額`}
          className="w-24 rounded-lg bg-key px-2 py-1.5 text-right tabular-nums"
        />
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => skipDueItem(item)}
          disabled={disabled}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-2 active:bg-key disabled:opacity-40"
        >
          跳過
        </button>
        <button
          type="button"
          onClick={() => confirmDueItem(item, amountMinor)}
          disabled={disabled || amountMinor <= 0}
          className="rounded-lg bg-ink px-4 py-1.5 text-sm font-semibold text-surface disabled:opacity-40"
        >
          確認
        </button>
      </div>
    </div>
  )
}
