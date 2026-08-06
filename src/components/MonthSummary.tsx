import { addMonths, formatMonthLabel } from '../lib/dates'
import { formatAmount } from '../lib/money'

interface Props {
  month: string
  expense: number
  income: number
  /** 目前有沒有套用篩選。有的話合計只涵蓋篩選後的帳，必須講清楚。 */
  filtered: boolean
  onMonthChange: (month: string) => void
}

/** 月份切換與三欄合計。 */
export function MonthSummary({
  month,
  expense,
  income,
  filtered,
  onMonthChange,
}: Props) {
  return (
    <header className="border-b border-hairline px-4 pt-3 pb-4">
      <div className="flex items-center justify-between">
        <MonthStep label="上個月" onClick={() => onMonthChange(addMonths(month, -1))}>
          ‹
        </MonthStep>
        <span className="text-base font-medium">{formatMonthLabel(month)}</span>
        <MonthStep label="下個月" onClick={() => onMonthChange(addMonths(month, 1))}>
          ›
        </MonthStep>
      </div>

      <div className="mt-3 flex justify-around">
        <Total label="支出" value={expense} />
        <Total label="收入" value={income} />
        <Total label="結餘" value={income - expense} signed />
      </div>

      {filtered && (
        // 不講的話使用者會以為這個月真的只花了這些。
        <p className="mt-2 text-center text-xs text-ink-3">合計僅計入篩選後的帳</p>
      )}
    </header>
  )
}

function MonthStep({
  children,
  label,
  onClick,
}: {
  children: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-9 w-9 rounded-full text-xl text-ink-2 active:bg-key"
    >
      {children}
    </button>
  )
}

function Total({
  label,
  value,
  signed = false,
}: {
  label: string
  value: number
  signed?: boolean
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {signed && value !== 0 ? (value > 0 ? '+' : '−') : ''}
        {formatAmount(value)}
      </div>
    </div>
  )
}
