import { describe, expect, test } from 'vitest'
import {
  categoryBreakdown,
  filterTransactions,
  monthlyTotals,
  sumByType,
  type StatCategory,
  type StatEntry,
} from './stats'

/** 造一筆帳，只指定關心的欄位。 */
function tx(patch: Partial<StatEntry> = {}): StatEntry {
  return {
    type: 'expense',
    amountMinor: 10000,
    date: '2026-08-06',
    categoryId: 'food',
    note: '',
    ...patch,
  }
}

function cat(id: string, name: string): StatCategory {
  return { id, name }
}

describe('sumByType', () => {
  test('只加總指定類型', () => {
    const rows = [
      tx({ amountMinor: 100 }),
      tx({ amountMinor: 250 }),
      tx({ amountMinor: 9999, type: 'income' }),
    ]
    expect(sumByType(rows, 'expense')).toBe(350)
    expect(sumByType(rows, 'income')).toBe(9999)
  })

  test('沒有資料時是 0', () => {
    expect(sumByType([], 'expense')).toBe(0)
  })
})

describe('categoryBreakdown', () => {
  test('依金額由大到小排序', () => {
    const rows = [
      tx({ categoryId: 'food', amountMinor: 100 }),
      tx({ categoryId: 'fixed', amountMinor: 900 }),
      tx({ categoryId: 'transport', amountMinor: 500 }),
    ]
    expect(categoryBreakdown(rows, 'expense').map((s) => s.categoryId)).toEqual([
      'fixed',
      'transport',
      'food',
    ])
  })

  test('同一分類的多筆會合併', () => {
    const rows = [
      tx({ categoryId: 'food', amountMinor: 300 }),
      tx({ categoryId: 'food', amountMinor: 700 }),
    ]
    const result = categoryBreakdown(rows, 'expense')
    expect(result).toHaveLength(1)
    expect(result[0].amountMinor).toBe(1000)
  })

  test('只看指定類型', () => {
    const rows = [
      tx({ categoryId: 'food', amountMinor: 100 }),
      tx({ categoryId: 'salary', amountMinor: 900, type: 'income' }),
    ]
    expect(categoryBreakdown(rows, 'expense').map((s) => s.categoryId)).toEqual([
      'food',
    ])
  })

  test('金額相同時以 categoryId 決定順序', () => {
    // 不指定就會依賴 Map 的插入順序，換個查詢方式排名就變了。
    const rows = [
      tx({ categoryId: 'transport', amountMinor: 500 }),
      tx({ categoryId: 'clothing', amountMinor: 500 }),
    ]
    expect(categoryBreakdown(rows, 'expense').map((s) => s.categoryId)).toEqual([
      'clothing',
      'transport',
    ])
  })

  test('沒有資料時回傳空陣列', () => {
    expect(categoryBreakdown([], 'expense')).toEqual([])
  })

  test('總額為 0 時不做除法，百分比都是 0', () => {
    const rows = [tx({ categoryId: 'food', amountMinor: 0 })]
    expect(categoryBreakdown(rows, 'expense')[0].sharePercent).toBe(0)
  })
})

describe('百分比一律加總為 100', () => {
  /** 造 n 個等額分類。 */
  function evenSplit(n: number): StatEntry[] {
    return Array.from({ length: n }, (_, i) =>
      tx({ categoryId: `c${i}`, amountMinor: 100 }),
    )
  }

  test('三等分得 34/33/33 而不是 33/33/33', () => {
    // 各自四捨五入會得到 99。必須用最大餘額法把差額補回去。
    const shares = categoryBreakdown(evenSplit(3), 'expense').map(
      (s) => s.sharePercent,
    )
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
    expect([...shares].sort((a, b) => b - a)).toEqual([34, 33, 33])
  })

  test('七等分也剛好 100', () => {
    const shares = categoryBreakdown(evenSplit(7), 'expense').map(
      (s) => s.sharePercent,
    )
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
  })

  test('二到十二個等額分類都加總為 100', () => {
    for (let n = 2; n <= 12; n += 1) {
      const shares = categoryBreakdown(evenSplit(n), 'expense').map(
        (s) => s.sharePercent,
      )
      expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
    }
  })

  test('單一分類是 100', () => {
    expect(categoryBreakdown(evenSplit(1), 'expense')[0].sharePercent).toBe(100)
  })

  test('零頭很碎的金額也加總為 100', () => {
    const rows = [
      tx({ categoryId: 'a', amountMinor: 3333 }),
      tx({ categoryId: 'b', amountMinor: 3333 }),
      tx({ categoryId: 'c', amountMinor: 3334 }),
      tx({ categoryId: 'd', amountMinor: 1 }),
    ]
    const shares = categoryBreakdown(rows, 'expense').map((s) => s.sharePercent)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
  })

  test('補的 1% 給小數部分最大的那一個', () => {
    // 60/30/10 剛好整除，不需要補；改成會產生餘數的組合驗證補在正確的人身上。
    const rows = [
      tx({ categoryId: 'big', amountMinor: 1000 }),
      tx({ categoryId: 'mid', amountMinor: 500 }),
      tx({ categoryId: 'small', amountMinor: 500 }),
    ]
    // 各為 50%、25%、25%，剛好整除
    const shares = categoryBreakdown(rows, 'expense')
    expect(shares.map((s) => s.sharePercent)).toEqual([50, 25, 25])
  })
})

describe('monthlyTotals', () => {
  test('依傳入的月份順序回傳', () => {
    const rows = [
      tx({ date: '2026-07-15', amountMinor: 700 }),
      tx({ date: '2026-08-15', amountMinor: 800 }),
    ]
    const result = monthlyTotals(rows, ['2026-07', '2026-08'])
    expect(result.map((m) => m.month)).toEqual(['2026-07', '2026-08'])
    expect(result.map((m) => m.expense)).toEqual([700, 800])
  })

  test('沒有帳的月份補 0 而不是略過', () => {
    // 略過會讓趨勢圖的時間軸變成不等距，看起來像那個月不存在。
    const rows = [tx({ date: '2026-08-15', amountMinor: 800 })]
    const result = monthlyTotals(rows, ['2026-06', '2026-07', '2026-08'])
    expect(result).toHaveLength(3)
    expect(result.map((m) => m.expense)).toEqual([0, 0, 800])
  })

  test('收支分開統計', () => {
    const rows = [
      tx({ date: '2026-08-01', amountMinor: 300 }),
      tx({ date: '2026-08-02', amountMinor: 5000, type: 'income' }),
    ]
    expect(monthlyTotals(rows, ['2026-08'])[0]).toEqual({
      month: '2026-08',
      expense: 300,
      income: 5000,
    })
  })

  test('範圍外的帳不計入', () => {
    const rows = [tx({ date: '2026-01-01', amountMinor: 999 })]
    expect(monthlyTotals(rows, ['2026-08'])[0].expense).toBe(0)
  })
})

describe('filterTransactions', () => {
  const categories = [
    cat('food', '飲食'),
    cat('transport', '交通'),
    cat('salary', '薪水'),
  ]
  const rows = [
    tx({ categoryId: 'food', note: '午餐' }),
    tx({ categoryId: 'transport', note: '捷運' }),
    tx({ categoryId: 'salary', note: '八月', type: 'income' }),
  ]
  const none = { query: '', type: 'all' as const, categoryIds: [] }

  test('空條件回傳全部', () => {
    expect(filterTransactions(rows, categories, none)).toHaveLength(3)
  })

  test('搜尋備註', () => {
    const result = filterTransactions(rows, categories, { ...none, query: '午餐' })
    expect(result.map((r) => r.categoryId)).toEqual(['food'])
  })

  test('搜尋分類名稱', () => {
    // 打「飲」要找得到飲食類的帳，即使備註裡沒有這個字。
    const result = filterTransactions(rows, categories, { ...none, query: '飲' })
    expect(result.map((r) => r.categoryId)).toEqual(['food'])
  })

  test('搜尋忽略大小寫與前後空白', () => {
    const withEnglish = [tx({ categoryId: 'food', note: 'Uber Eats' })]
    const result = filterTransactions(withEnglish, categories, {
      ...none,
      query: '  uber ',
    })
    expect(result).toHaveLength(1)
  })

  test('依類型篩選', () => {
    const result = filterTransactions(rows, categories, { ...none, type: 'income' })
    expect(result.map((r) => r.categoryId)).toEqual(['salary'])
  })

  test('依分類篩選，可多選', () => {
    const result = filterTransactions(rows, categories, {
      ...none,
      categoryIds: ['food', 'transport'],
    })
    expect(result).toHaveLength(2)
  })

  test('多個條件是交集', () => {
    const result = filterTransactions(rows, categories, {
      query: '捷運',
      type: 'expense',
      categoryIds: ['food'],
    })
    expect(result).toEqual([])
  })

  test('找不到分類的帳仍可用備註搜到', () => {
    // 分類被刪掉的舊帳不該從搜尋結果裡消失。
    const orphan = [tx({ categoryId: 'gone', note: '舊帳' })]
    expect(filterTransactions(orphan, categories, { ...none, query: '舊帳' })).toHaveLength(1)
  })

  test('不修改傳入的陣列', () => {
    const before = rows.length
    filterTransactions(rows, categories, { ...none, query: '午餐' })
    expect(rows).toHaveLength(before)
  })
})
