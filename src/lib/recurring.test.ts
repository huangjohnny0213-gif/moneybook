import { describe, expect, test } from 'vitest'
import { expandDueRules, type RecurringLike } from './recurring'

/** 造一條規則，只指定關心的欄位。預設是一條從 1 月開始、每月 31 號的房租。 */
function rule(patch: Partial<RecurringLike> = {}): RecurringLike {
  return {
    id: 'rent',
    type: 'expense',
    amountMinor: 1800000,
    categoryId: 'fixed',
    note: '房租',
    dayOfMonth: 31,
    startDate: '2026-01-01',
    endDate: undefined,
    active: true,
    lastGeneratedMonth: '',
    ...patch,
  }
}

describe('母計畫的驗收案例', () => {
  test('31 號規則推到 3 月底，補出 1/31、2/28、3/31 三筆', () => {
    const items = expandDueRules([rule()], '2026-03-31')
    expect(items.map((i) => i.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
  })

  test('每一筆都帶著該月份，供確認後推進鎖用', () => {
    const items = expandDueRules([rule()], '2026-03-31')
    expect(items.map((i) => i.month)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  test('帶著規則的內容供寫入交易', () => {
    const [first] = expandDueRules([rule()], '2026-01-31')
    expect(first).toMatchObject({
      ruleId: 'rent',
      type: 'expense',
      amountMinor: 1800000,
      categoryId: 'fixed',
      note: '房租',
    })
  })
})

describe('冪等：開三次 App 不能記三次房租', () => {
  test('鎖推進到最後一個月之後，再展開就是空的', () => {
    const first = expandDueRules([rule()], '2026-03-31')
    expect(first).toHaveLength(3)

    // 模擬使用者把三筆都處理掉，鎖推進到最後一筆的月份
    const advanced = rule({ lastGeneratedMonth: first.at(-1)!.month })
    expect(expandDueRules([advanced], '2026-03-31')).toEqual([])
  })

  test('連續展開三次結果完全相同，不會累加', () => {
    const today = '2026-03-31'
    const a = expandDueRules([rule()], today)
    const b = expandDueRules([rule()], today)
    const c = expandDueRules([rule()], today)
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  test('鎖停在中間時只補剩下的月份', () => {
    const items = expandDueRules(
      [rule({ lastGeneratedMonth: '2026-01' })],
      '2026-03-31',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-02-28', '2026-03-31'])
  })
})

describe('月底夾取', () => {
  test('平年的 2 月夾到 28', () => {
    const items = expandDueRules(
      [rule({ lastGeneratedMonth: '2026-01' })],
      '2026-02-28',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-02-28'])
  })

  test('閏年的 2 月夾到 29', () => {
    // 直接 new Date(2028, 1, 31) 會溢位到 3 月 2 日，那樣房租會記在錯的月份。
    const items = expandDueRules(
      [rule({ startDate: '2028-02-01', lastGeneratedMonth: '2028-01' })],
      '2028-02-29',
    )
    expect(items.map((i) => i.date)).toEqual(['2028-02-29'])
  })

  test('小月夾到 30', () => {
    const items = expandDueRules(
      [rule({ lastGeneratedMonth: '2026-03' })],
      '2026-04-30',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-04-30'])
  })

  test('大月維持 31', () => {
    const items = expandDueRules(
      [rule({ lastGeneratedMonth: '2026-04' })],
      '2026-05-31',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-05-31'])
  })

  test('不需要夾取的日子原樣使用', () => {
    const items = expandDueRules(
      [rule({ dayOfMonth: 5, lastGeneratedMonth: '2026-01' })],
      '2026-02-28',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-02-05'])
  })
})

describe('不產生還沒發生的帳', () => {
  test('這個月的到期日還沒到就不出現', () => {
    // 今天 8/6、規則設 31 號，八月那筆要等 8/31 過了才算數。
    // 提前產生等於把未來的支出算進這個月的報表。
    const items = expandDueRules(
      [rule({ lastGeneratedMonth: '2026-07' })],
      '2026-08-06',
    )
    expect(items).toEqual([])
  })

  test('到期日就是今天則算數', () => {
    const items = expandDueRules(
      [rule({ dayOfMonth: 6, lastGeneratedMonth: '2026-07' })],
      '2026-08-06',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-08-06'])
  })
})

describe('規則的生效範圍', () => {
  test('停用的規則不產生任何東西', () => {
    expect(expandDueRules([rule({ active: false })], '2026-03-31')).toEqual([])
  })

  test('開始日期之前的月份不產生', () => {
    const items = expandDueRules(
      [rule({ startDate: '2026-02-15' })],
      '2026-03-31',
    )
    // 2/28 在 startDate 之後所以算數，1 月整個月都在生效之前
    expect(items.map((i) => i.date)).toEqual(['2026-02-28', '2026-03-31'])
  })

  test('開始日期當月但到期日在它之前，該月不算', () => {
    const items = expandDueRules(
      [rule({ dayOfMonth: 5, startDate: '2026-01-20' })],
      '2026-02-28',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-02-05'])
  })

  test('結束日期之後不再產生', () => {
    const items = expandDueRules(
      [rule({ endDate: '2026-02-28' })],
      '2026-03-31',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-01-31', '2026-02-28'])
  })

  test('結束日期當天仍算數', () => {
    const items = expandDueRules(
      [rule({ endDate: '2026-01-31' })],
      '2026-03-31',
    )
    expect(items.map((i) => i.date)).toEqual(['2026-01-31'])
  })
})

describe('全部補齊策略', () => {
  test('停用半年後重新啟用，六個月一次補齊', () => {
    const items = expandDueRules(
      [rule({ dayOfMonth: 1, lastGeneratedMonth: '2026-01' })],
      '2026-07-15',
    )
    expect(items.map((i) => i.date)).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ])
  })

  test('跨年也照補', () => {
    const items = expandDueRules(
      [rule({ dayOfMonth: 1, startDate: '2025-11-01' })],
      '2026-02-15',
    )
    expect(items.map((i) => i.date)).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ])
  })
})

describe('多條規則', () => {
  test('結果依日期由舊到新排序', () => {
    const rules = [
      rule({ id: 'rent', dayOfMonth: 25, lastGeneratedMonth: '2026-01' }),
      rule({ id: 'phone', dayOfMonth: 5, lastGeneratedMonth: '2026-01' }),
    ]
    const items = expandDueRules(rules, '2026-03-31')
    expect(items.map((i) => `${i.ruleId} ${i.date}`)).toEqual([
      'phone 2026-02-05',
      'rent 2026-02-25',
      'phone 2026-03-05',
      'rent 2026-03-25',
    ])
  })

  test('沒有規則時回傳空陣列', () => {
    expect(expandDueRules([], '2026-03-31')).toEqual([])
  })

  test('不修改傳入的規則', () => {
    const rules = [rule()]
    const snapshot = structuredClone(rules)
    expandDueRules(rules, '2026-03-31')
    expect(rules).toEqual(snapshot)
  })
})
