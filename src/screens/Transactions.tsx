import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BackupReminder } from '../components/BackupReminder'
import { CategoryRank } from '../components/CategoryRank'
import { EditSheet } from '../components/EditSheet'
import { FilterBar } from '../components/FilterBar'
import { MonthSummary } from '../components/MonthSummary'
import { TrendChart } from '../components/TrendChart'
import { useTheme } from '../components/themeContext'
import { formatDayLabel, monthKey, recentMonths, todayISO } from '../lib/dates'
import { categoryGlyph } from '../lib/glyph'
import { formatSigned } from '../lib/money'
import {
  categoryBreakdown,
  filterTransactions,
  monthlyTotals,
  sumByType,
  type Filter,
} from '../lib/stats'
import {
  listAllCategories,
  listTransactionsBetween,
  listTransactionsByMonth,
} from '../db/repo'
import type { Category, Transaction } from '../db/schema'

const TREND_MONTHS = 6
const NO_FILTER: Filter = { query: '', type: 'all', categoryIds: [] }

/** 明細畫面：上半是這個月的樣貌，下半是逐筆的帳。 */
export function Transactions({ onGoToBackup }: { onGoToBackup: () => void }) {
  const [month, setMonth] = useState(() => monthKey(todayISO()))
  const [filter, setFilter] = useState<Filter>(NO_FILTER)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const monthRows = useLiveQuery(
    () => listTransactionsByMonth(month),
    [month],
    [] as Transaction[],
  )
  const categories = useLiveQuery(listAllCategories, [], [] as Category[])

  const months = useMemo(() => recentMonths(month, TREND_MONTHS), [month])
  const trendRows = useLiveQuery(
    // 上界用 -31 即使該月沒有 31 號也沒關係：日期是等寬字串，
    // '2026-02-28' 仍然小於 '2026-02-31'，所以整個月都涵蓋得到。
    () => listTransactionsBetween(`${months[0]}-01`, `${month}-31`),
    [months, month],
    [] as Transaction[],
  )

  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  // 兩張圖與合計都跟著篩選走。篩了「飲食」之後趨勢圖還畫全部，
  // 上下兩塊數字對不起來，使用者無從判斷哪個才是真的。
  const visible = filterTransactions(monthRows, categories, filter)
  const slices = categoryBreakdown(visible, 'expense')
  const trend = monthlyTotals(
    filterTransactions(trendRows, categories, filter),
    months,
  )
  const isFiltered = visible.length !== monthRows.length

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <BackupReminder onGoToBackup={onGoToBackup} />
        <MonthSummary
          month={month}
          expense={sumByType(visible, 'expense')}
          income={sumByType(visible, 'income')}
          filtered={isFiltered}
          onMonthChange={setMonth}
        />
        <TrendChart totals={trend} selected={month} onSelect={setMonth} />
        <CategoryRank slices={slices} categories={byId} />
        <FilterBar
          filter={filter}
          categories={categories.filter((c) => !c.archived)}
          onChange={setFilter}
        />

        {visible.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-ink-3">
            {monthRows.length === 0
              ? '這個月還沒有帳。到「記帳」記下第一筆。'
              : '沒有符合條件的帳。'}
          </p>
        ) : (
          groupByDate(visible).map(([date, dayRows]) => (
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

function Row({
  row,
  category,
  onSelect,
}: {
  row: Transaction
  category: Category | undefined
  onSelect: () => void
}) {
  const { seriesColor } = useTheme()
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-hairline px-4 py-2.5 text-left active:bg-key"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm text-white"
        style={{
          background: category ? seriesColor(category.color) : 'var(--ink-3)',
        }}
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
