import { useState } from 'react'
import { useTheme } from './themeContext'
import { categoryGlyph } from '../lib/glyph'
import { formatAmount, toMinor } from '../lib/money'
import { deleteTransaction, updateTransaction } from '../db/repo'
import type { Category, Transaction } from '../db/schema'

/**
 * 編輯單筆的面板。
 *
 * 這裡用一般的文字輸入而非自製鍵盤：改帳是偶爾為之的動作，
 * 為它再擺一組鍵盤會把面板撐到整頁高，反而更難用。
 */
export function EditSheet({
  transaction,
  categories,
  onClose,
}: {
  transaction: Transaction
  categories: Category[]
  onClose: () => void
}) {
  const [amount, setAmount] = useState(() =>
    formatAmount(transaction.amountMinor).replace(/,/g, ''),
  )
  const [date, setDate] = useState(transaction.date)
  const [note, setNote] = useState(transaction.note)
  const [categoryId, setCategoryId] = useState(transaction.categoryId)
  const { seriesColor } = useTheme()

  const amountMinor = toMinor(amount)

  async function save() {
    if (amountMinor <= 0) return
    await updateTransaction(transaction.id, {
      amountMinor,
      date,
      note: note.trim(),
      categoryId,
    })
    onClose()
  }

  async function remove() {
    await deleteTransaction(transaction.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col justify-end bg-black/40">
      {/* 點背景關閉。鍵盤使用者用面板裡的「取消」，所以這層不進 tab 順序。 */}
      <button
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="flex-1"
        tabIndex={-1}
      />
      <div className="rounded-t-2xl bg-raised px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="mb-3 text-sm font-medium text-ink-2">編輯這筆</h2>

        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="金額"
            className="w-32 rounded-lg bg-key px-3 py-2 text-right tabular-nums"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="日期"
            className="flex-1 rounded-lg bg-key px-3 py-2"
          />
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="備註"
          aria-label="備註"
          className="mt-2 w-full rounded-lg bg-key px-3 py-2 placeholder:text-ink-3"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
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

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={remove}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#d03b3b] active:bg-key"
          >
            刪除
          </button>
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
            disabled={amountMinor <= 0}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-surface disabled:opacity-40"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}
