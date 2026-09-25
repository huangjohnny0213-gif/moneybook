import { addMonths, formatMonthLabel } from '../lib/dates'
import { formatAmount } from '../lib/money'
import type { TxType } from '../types'

interface Props {
  month: string
  expense: number
  income: number
  /** 目前有沒有套用篩選。有的話合計只涵蓋篩選後的帳，必須講清楚。 */
  filtered: boolean
  /** 下方分類排行正在看哪一種。 */
  breakdownType: TxType
  onMonthChange: (month: string) => void
  onBreakdownTypeChange: (type: TxType) => void
}

/** 月份切換與三欄合計。 */
export function MonthSummary({
  month,
  expense,
  income,
  filtered,
  breakdownType,
  onMonthChange,
  onBreakdownTypeChange,
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

      {/* 點支出或收入切換下方排行看哪一種。收入排行不另開一塊常駐區塊：
          收入通常只有薪水一類，多一塊永遠只有一根長條的區塊只會讓頁面變長。 */}
      <div className="mt-3 flex justify-around">
        <Total
          label="支出"
          value={expense}
          selected={breakdownType === 'expense'}
          onSelect={() => onBreakdownTypeChange('expense')}
        />
        <Total
          label="收入"
          value={income}
          selected={breakdownType === 'income'}
          onSelect={() => onBreakdownTypeChange('income')}
        />
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
  selected,
  onSelect,
}: {
  label: string
  value: number
  signed?: boolean
  /** 有給 onSelect 才是可點的欄位；結餘沒有排行可看，維持純文字。 */
  selected?: boolean
  onSelect?: () => void
}) {
  const content = (
    <>
      <div
        className={`text-xs ${selected ? 'text-ink underline decoration-1 underline-offset-4' : 'text-ink-3'}`}
      >
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">
        {signed && value !== 0 ? (value > 0 ? '+' : '−') : ''}
        {formatAmount(value)}
      </div>
    </>
  )

  if (!onSelect) return <div className="px-2 text-center">{content}</div>

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="rounded-lg px-2 text-center active:bg-key"
    >
      {content}
    </button>
  )
}
