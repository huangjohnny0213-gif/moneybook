import { monthKey } from './dates'
import type { TxType } from '../types'

/**
 * 報表用的統計。
 *
 * 全部是純函式，不碰資料庫。參數用結構型別而非 db/schema 的 Transaction，
 * lib 不該反向依賴 db；泛型讓呼叫端傳進完整的 Transaction 時型別不會被削掉。
 */

/** 統計需要的交易欄位。 */
export interface StatEntry {
  type: TxType
  amountMinor: number
  date: string
  categoryId: string
  note: string
}

/** 統計需要的分類欄位。 */
export interface StatCategory {
  id: string
  name: string
}

export interface CategorySlice {
  categoryId: string
  amountMinor: number
  /** 佔該類型總額的百分比，整數。同一組回傳值加總必為 100。 */
  sharePercent: number
}

export interface MonthTotal {
  month: string
  expense: number
  income: number
}

export interface Filter {
  query: string
  type: TxType | 'all'
  /** 空陣列代表不限分類。 */
  categoryIds: readonly string[]
}

/** 某個類型的總額。 */
export function sumByType(
  rows: readonly StatEntry[],
  type: TxType,
): number {
  return rows.reduce(
    (total, row) => (row.type === type ? total + row.amountMinor : total),
    0,
  )
}

/**
 * 各分類的金額與佔比，由大到小排序。
 *
 * 百分比用**最大餘額法**：先全部無條件捨去，再把差額依小數部分由大到小逐一補 1。
 * 各自四捨五入是錯的 —— 三個各佔三分之一的分類會得到 33 + 33 + 33 = 99，
 * 報表上就會出現「加起來不到 100%」這種一眼看得出來的破綻。
 */
export function categoryBreakdown(
  rows: readonly StatEntry[],
  type: TxType,
): CategorySlice[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.type !== type) continue
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + row.amountMinor)
  }

  // 金額相同時以 id 決定順序，否則排名會跟著 Map 的插入順序跑，
  // 換一種查詢方式畫面上的名次就變了。
  const entries = [...totals].sort(
    ([idA, amountA], [idB, amountB]) =>
      amountB - amountA || (idA < idB ? -1 : 1),
  )

  const total = entries.reduce((sum, [, amount]) => sum + amount, 0)
  if (total === 0) {
    return entries.map(([categoryId, amountMinor]) => ({
      categoryId,
      amountMinor,
      sharePercent: 0,
    }))
  }

  const exact = entries.map(([, amount]) => (amount * 100) / total)
  const shares = exact.map(Math.floor)
  const shortfall = 100 - shares.reduce((sum, share) => sum + share, 0)

  // 小數部分最大的先補。同分時維持原順序，也就是金額大的先拿到。
  const byLargestRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)

  for (let given = 0; given < shortfall; given += 1) {
    shares[byLargestRemainder[given].index] += 1
  }

  return entries.map(([categoryId, amountMinor], index) => ({
    categoryId,
    amountMinor,
    sharePercent: shares[index],
  }))
}

/**
 * 每個月的收支，順序與傳入的月份一致。
 *
 * 沒有帳的月份補 0 而不是略過：略過會讓趨勢圖的時間軸變成不等距，
 * 看起來像那幾個月不存在。
 */
export function monthlyTotals(
  rows: readonly StatEntry[],
  months: readonly string[],
): MonthTotal[] {
  const byMonth = new Map<string, MonthTotal>(
    months.map((month) => [month, { month, expense: 0, income: 0 }]),
  )

  for (const row of rows) {
    const bucket = byMonth.get(monthKey(row.date))
    if (!bucket) continue
    if (row.type === 'expense') bucket.expense += row.amountMinor
    else bucket.income += row.amountMinor
  }

  return months.map((month) => byMonth.get(month)!)
}

/**
 * 依搜尋字與分類篩選。多個條件之間是交集。
 *
 * 搜尋同時比對備註與分類名稱，打「飲」要找得到飲食類的帳，
 * 即使那筆的備註是空的。
 */
export function filterTransactions<T extends StatEntry>(
  rows: readonly T[],
  categories: readonly StatCategory[],
  filter: Filter,
): T[] {
  const query = filter.query.trim().toLowerCase()
  const nameById = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]))
  const wanted = new Set(filter.categoryIds)

  return rows.filter((row) => {
    if (filter.type !== 'all' && row.type !== filter.type) return false
    if (wanted.size > 0 && !wanted.has(row.categoryId)) return false
    if (query === '') return true

    // 分類被刪掉的舊帳查不到名稱，但備註仍然要能搜到。
    const name = nameById.get(row.categoryId) ?? ''
    return row.note.toLowerCase().includes(query) || name.includes(query)
  })
}
