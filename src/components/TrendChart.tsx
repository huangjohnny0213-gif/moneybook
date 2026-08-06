import { formatAmount } from '../lib/money'
import type { MonthTotal } from '../lib/stats'

interface Props {
  totals: MonthTotal[]
  selected: string
  onSelect: (month: string) => void
}

/**
 * 近六月收支趨勢。
 *
 * 每個月一組兩根柱，支出用墨色、收入用中灰 —— 這裡刻意不動用分類色盤：
 * 那八個色階的工作是標示分類身分，借來表示收支會讓「顏色代表什麼」變成兩套規則。
 *
 * 點一下某個月就切到該月份，圖表同時是導覽，省掉另做一個月份選單。
 */
export function TrendChart({ totals, selected, onSelect }: Props) {
  // 支出與收入共用同一個高度基準，否則兩根柱的高度不能互相比較。
  const max = Math.max(...totals.flatMap((t) => [t.expense, t.income]), 1)

  return (
    <section className="border-b border-hairline px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs text-ink-3">
          近六月
          {/* 只標最高的那根，讓柱子的高度有個數值錨點。
              每根都標會蓋掉圖形本身要傳達的形狀。 */}
          <span className="ml-2 tabular-nums">上限 {formatAmount(max)}</span>
        </h2>
        <div className="flex gap-3 text-xs text-ink-3">
          <Key className="bg-ink">支出</Key>
          <Key className="bg-ink-3">收入</Key>
        </div>
      </div>

      <div className="flex h-24 items-end gap-1">
        {totals.map((total) => {
          const isSelected = total.month === selected
          return (
            <button
              key={total.month}
              type="button"
              onClick={() => onSelect(total.month)}
              aria-label={`${total.month}，支出 ${formatAmount(total.expense)}，收入 ${formatAmount(total.income)}`}
              aria-current={isSelected ? 'true' : undefined}
              className="flex h-full flex-1 flex-col justify-end gap-1 rounded-t active:bg-key"
            >
              <span className="flex flex-1 items-end justify-center gap-[3px]">
                <Bar height={total.expense / max} className="bg-ink" />
                <Bar height={total.income / max} className="bg-ink-3" />
              </span>
              <span
                className={`text-[10px] tabular-nums ${
                  isSelected ? 'font-semibold text-ink' : 'text-ink-3'
                }`}
              >
                {Number(total.month.slice(5))}月
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * 一根柱。
 *
 * 金額為 0 時仍留 2px 的殘幹，讓「這個月有資料但沒有支出」看起來不像缺一塊，
 * 也維持柱子之間的節奏。
 */
function Bar({ height, className }: { height: number; className: string }) {
  return (
    <span
      className={`w-1/3 rounded-t-[2px] ${className}`}
      style={{ height: `${Math.max(height * 100, 1.5)}%` }}
    />
  )
}

function Key({ children, className }: { children: string; className: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-[1px] ${className}`} aria-hidden="true" />
      {children}
    </span>
  )
}
