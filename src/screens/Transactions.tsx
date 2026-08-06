import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addMonths,
  formatDayLabel,
  formatMonthLabel,
  monthKey,
  todayISO,
} from '../lib/dates'
import { categoryGlyph } from '../lib/glyph'
import { formatAmount, formatSigned, toMinor } from '../lib/money'
import {
  deleteTransaction,
  listAllCategories,
  listTransactionsByMonth,
  updateTransaction,
} from '../db/repo'
import type { Category, Transaction } from '../db/schema'

/** 明細畫面：依月份看帳，點一筆可以改或刪。 */
export function Transactions() {
  const [month, setMonth] = useState(() => monthKey(todayISO()))
  const [editing, setEditing] = useState<Transaction | null>(null)

  const rows = useLiveQuery(
    () => listTransactionsByMonth(month),
    [month],
    [] as Transaction[],
  )
  const categories = useLiveQuery(listAllCategories, [], [] as Category[])
  const byId = new Map(categories.map((c) => [c.id, c]))

  const expense = sumOf(rows, 'expense')
  const income = sumOf(rows, 'income')

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hairline px-4 pt-3 pb-4">
        <div className="flex items-center justify-between">
          <MonthStep label="上個月" onClick={() => setMonth(addMonths(month, -1))}>
            ‹
          </MonthStep>
          <span className="text-base font-medium">{formatMonthLabel(month)}</span>
          <MonthStep label="下個月" onClick={() => setMonth(addMonths(month, 1))}>
            ›
          </MonthStep>
        </div>

        <div className="mt-3 flex justify-around">
          <Total label="支出" value={expense} />
          <Total label="收入" value={income} />
          <Total label="結餘" value={income - expense} signed />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-ink-3">
            這個月還沒有帳。到「記帳」記下第一筆。
          </p>
        ) : (
          groupByDate(rows).map(([date, dayRows]) => (
            <section key={date}>
              <h2 className="sticky top-0 bg-surface px-4 py-1.5 text-xs font-medium text-ink-3">
                {formatDayLabel(date)}
              </h2>
              {dayRows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  category={byId.get(row.categoryId)}
                  onSelect={() => setEditing(row)}
                />
              ))}
            </section>
          ))
        )}
      </div>

      {editing && (
        <EditSheet
          transaction={editing}
          categories={categories.filter((c) => c.type === editing.type)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function sumOf(rows: Transaction[], type: Transaction['type']): number {
  return rows
    .filter((r) => r.type === type)
    .reduce((total, r) => total + r.amountMinor, 0)
}

/** 依日期分組，維持原本的新到舊順序。 */
function groupByDate(rows: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>()
  for (const row of rows) {
    const existing = groups.get(row.date)
    if (existing) existing.push(row)
    else groups.set(row.date, [row])
  }
  return [...groups]
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

function Row({
  row,
  category,
  onSelect,
}: {
  row: Transaction
  category: Category | undefined
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-hairline px-4 py-2.5 text-left active:bg-key"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm text-white"
        style={{ background: category?.color ?? 'var(--ink-3)' }}
      >
        {category ? categoryGlyph(category) : '?'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink">
          {category?.name ?? '未知分類'}
        </span>
        {row.note && (
          <span className="block truncate text-xs text-ink-3">{row.note}</span>
        )}
      </span>
      <span className="shrink-0 text-base font-medium tabular-nums">
        {formatSigned(row.amountMinor, row.type)}
      </span>
    </button>
  )
}

/**
 * 編輯單筆的面板。
 *
 * 這裡用一般的文字輸入而非自製鍵盤：改帳是偶爾為之的動作，
 * 為它再擺一組鍵盤會把面板撐到整頁高，反而更難用。
 */
function EditSheet({
  transaction,
  categories,
  onClose,
}: {
  transaction: Transaction
  categories: Category[]
  onClose: () => void
}) {
  const [amount, setAmount] = useState(
    () => formatAmount(transaction.amountMinor).replace(/,/g, ''),
  )
  const [date, setDate] = useState(transaction.date)
  const [note, setNote] = useState(transaction.note)
  const [categoryId, setCategoryId] = useState(transaction.categoryId)

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
                  ? { background: category.color, color: '#fff' }
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
