import { useState } from 'react'
import { useTheme } from './themeContext'
import { todayISO } from '../lib/dates'
import { categoryGlyph } from '../lib/glyph'
import { formatAmount, toMinor } from '../lib/money'
import { addRecurringRule, updateRecurringRule } from '../db/repo'
import type { Category, RecurringRule } from '../db/schema'
import type { TxType } from '../types'

interface Props {
  /** null 代表新增。 */
  rule: RecurringRule | null
  categories: Category[]
  onClose: () => void
  onDelete?: () => void
}

/** 定期規則的編輯表單。 */
export function RuleEditor({ rule, categories, onClose, onDelete }: Props) {
  const [type, setType] = useState<TxType>(rule?.type ?? 'expense')
  const [amount, setAmount] = useState(() =>
    rule ? formatAmount(rule.amountMinor).replace(/,/g, '') : '',
  )
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '')
  const [note, setNote] = useState(rule?.note ?? '')
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.dayOfMonth ?? 1))
  const [startDate, setStartDate] = useState(rule?.startDate ?? todayISO())
  const [endDate, setEndDate] = useState(rule?.endDate ?? '')
  const { seriesColor } = useTheme()

  const options = categories.filter((c) => c.type === type)
  const amountMinor = toMinor(amount)
  const day = Number(dayOfMonth)
  const valid =
    amountMinor > 0 && categoryId !== '' && day >= 1 && day <= 31 && startDate !== ''

  async function save() {
    if (!valid) return
    const draft = {
      type,
      amountMinor,
      categoryId,
      note: note.trim(),
      dayOfMonth: day,
      startDate,
      endDate: endDate === '' ? undefined : endDate,
      active: rule?.active ?? true,
    }

    if (rule) await updateRecurringRule(rule.id, draft)
    else await addRecurringRule(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col justify-end bg-black/40">
      <button
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="flex-1"
        tabIndex={-1}
      />
      <div className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-raised px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="mb-3 text-sm font-medium text-ink-2">
          {rule ? '編輯定期支出' : '新增定期支出'}
        </h2>

        <div className="flex gap-1">
          {(['expense', 'income'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setType(option)
                // 分類清單會整個換掉，留著舊的 id 會存下對不上型別的規則。
                setCategoryId('')
              }}
              aria-pressed={type === option}
              className={`rounded-full px-4 py-1.5 text-sm ${
                type === option ? 'bg-ink text-surface' : 'bg-key text-ink-2'
              }`}
            >
              {option === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="金額"
            aria-label="金額"
            className="w-32 rounded-lg bg-key px-3 py-2 text-right tabular-nums placeholder:text-ink-3"
          />
          <label className="flex flex-1 items-center gap-2 rounded-lg bg-key px-3">
            <span className="shrink-0 text-sm text-ink-2">每月</span>
            <input
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              aria-label="每月幾號"
              className="w-10 bg-transparent py-2 text-center tabular-nums"
            />
            <span className="shrink-0 text-sm text-ink-2">號</span>
          </label>
        </div>

        {day > 28 && (
          // 這是最容易誤會的地方，直接講清楚比事後解釋好。
          <p className="mt-1.5 text-xs text-ink-3">
            當月沒有這一天時會記在該月最後一天（2 月為 28 或 29 號）。
          </p>
        )}

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="備註，例如「房租」"
          aria-label="備註"
          className="mt-2 w-full rounded-lg bg-key px-3 py-2 placeholder:text-ink-3"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              aria-pressed={category.id === categoryId}
              className="rounded-full px-3 py-1.5 text-sm"
              style={
                category.id === categoryId
                  ? { background: seriesColor(category.color), color: '#fff' }
                  : { background: 'var(--key)', color: 'var(--ink-2)' }
              }
            >
              {categoryGlyph(category)} {category.name}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-ink-3">開始</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="開始日期"
              className="w-full rounded-lg bg-key px-3 py-2"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-ink-3">結束（可留空）</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="結束日期"
              className="w-full rounded-lg bg-key px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#d03b3b] active:bg-key"
            >
              刪除
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-key px-4 py-2.5 text-sm font-medium text-ink-2"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-surface disabled:opacity-40"
          >
            儲存
          </button>
        </div>

        {onDelete && (
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            刪除規則不會動到已經記進去的帳，那些是真實發生過的支出。
          </p>
        )}
      </div>
    </div>
  )
}
