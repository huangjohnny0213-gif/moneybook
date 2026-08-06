import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NumericKeypad } from '../components/NumericKeypad'
import { useTheme } from '../components/themeContext'
import { EMPTY_AMOUNT, pressKey, type AmountKey } from '../lib/amountInput'
import { todayISO } from '../lib/dates'
import { categoryGlyph } from '../lib/glyph'
import { toMinor } from '../lib/money'
import { addTransaction, listCategories } from '../db/repo'
import type { TxType } from '../types'

/**
 * 記帳畫面。這是整個 App 的主畫面，目標是三秒記完一筆。
 *
 * 版面由上而下就是輸入順序：先決定收支、再打金額、再挑分類、最後補日期與備註。
 * 送出鍵放在鍵盤右側拉高三列，拇指不必瞄準。
 */
export function AddEntry() {
  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState(EMPTY_AMOUNT)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  const categories = useLiveQuery(() => listCategories(type), [type], [])
  const { seriesColor } = useTheme()

  const amountMinor = toMinor(amount)
  const canSubmit = amountMinor > 0 && categoryId !== null

  async function submit() {
    if (!canSubmit) return

    await addTransaction({
      type,
      amountMinor,
      date,
      categoryId,
      note: note.trim(),
    })

    // 只清掉「這一筆」的東西，日期與收支型別留著 ——
    // 補記帳時常常是一次補同一天的好幾筆。
    setAmount(EMPTY_AMOUNT)
    setNote('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1400)
  }

  function handleKey(key: AmountKey) {
    setAmount((current) => pressKey(current, key))
  }

  return (
    <div className="flex h-full flex-col">
      {/* 內層也是 flex 直排，讓下面的 spacer 把日期與備註推到緊貼鍵盤上緣，
          否則螢幕中間會空出一大塊沒有用途的死區。 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <TypeToggle
          value={type}
          onChange={(next) => {
            setType(next)
            // 分類清單會整個換掉，留著舊的 id 會送出對不上型別的帳。
            setCategoryId(null)
          }}
        />

        <AmountDisplay amount={amount} type={type} />

        <div className="grid grid-cols-4 gap-2 px-4 pb-4">
          {categories.map((category) => {
            const selected = category.id === categoryId
            const color = seriesColor(category.color)
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className="flex flex-col items-center gap-1.5 py-1"
                aria-pressed={selected}
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-lg transition-[background-color,color]"
                  style={
                    selected
                      ? { background: color, color: '#fff' }
                      : {
                          background: 'var(--key)',
                          color,
                          boxShadow: `inset 0 0 0 1.5px ${color}`,
                        }
                  }
                >
                  {categoryGlyph(category)}
                </span>
                <span
                  className={`text-xs ${selected ? 'text-ink' : 'text-ink-2'}`}
                >
                  {category.name}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="日期"
            className="rounded-lg bg-key px-3 py-2 text-ink"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註"
            aria-label="備註"
            className="min-w-0 flex-1 rounded-lg bg-key px-3 py-2 text-ink placeholder:text-ink-3"
          />
        </div>
      </div>

      <NumericKeypad
        onKey={handleKey}
        onSubmit={submit}
        submitLabel={saved ? '已記下' : '記一筆'}
        submitDisabled={!canSubmit}
      />
    </div>
  )
}

function TypeToggle({
  value,
  onChange,
}: {
  value: TxType
  onChange: (next: TxType) => void
}) {
  return (
    <div className="flex justify-center gap-1 p-3">
      {(['expense', 'income'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`rounded-full px-5 py-1.5 text-sm font-medium ${
            value === option
              ? 'bg-ink text-surface'
              : 'bg-key text-ink-2'
          }`}
        >
          {option === 'expense' ? '支出' : '收入'}
        </button>
      ))}
    </div>
  )
}

/**
 * 金額顯示區。
 *
 * 用 tabular-nums 是為了讓每個數字等寬：邊打邊變寬的話，整串數字會隨著輸入
 * 左右抖動，看起來像壞掉。這是少數該覆寫比例數字的場合。
 */
function AmountDisplay({ amount, type }: { amount: string; type: TxType }) {
  return (
    <div className="flex items-baseline justify-end gap-1.5 px-5 pt-1 pb-7">
      <span className="text-lg text-ink-3">{type === 'expense' ? '−' : '+'}</span>
      <span className="text-sm text-ink-3">NT$</span>
      <span className="text-5xl font-semibold tracking-tight text-ink tabular-nums">
        {amount}
      </span>
    </div>
  )
}
