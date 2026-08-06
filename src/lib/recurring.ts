import { addMonths, clampDayOfMonth, monthKey } from './dates'
import type { TxType } from '../types'

/**
 * 定期支出的展開邏輯。
 *
 * 手機 PWA 關掉之後不能執行背景程式，所以策略是每次開 App 檢查一次規則，
 * 把「應該發生但還沒記」的帳算出來給使用者確認。這裡只做計算不寫資料庫，
 * 寫入與推進鎖由 db/repo.ts 在單一交易裡完成。
 *
 * 型別自行宣告而不從 db/schema 匯入：lib 不可反向依賴 db。
 */

/** expandDueRules 需要的規則欄位。 */
export interface RecurringLike {
  id: string
  type: TxType
  amountMinor: number
  categoryId: string
  note: string
  /** 1-31，超過當月天數時夾到月底。 */
  dayOfMonth: number
  startDate: string
  endDate?: string
  active: boolean
  /** 'YYYY-MM'，已經處理到哪個月。空字串代表還沒開始。 */
  lastGeneratedMonth: string
}

/** 一筆等待使用者確認的定期帳。 */
export interface DueItem {
  ruleId: string
  /** 這一筆屬於哪個月，'YYYY-MM'。確認或跳過後寫回 lastGeneratedMonth。 */
  month: string
  /** 實際發生日，dayOfMonth 夾到當月最後一天之後的結果。 */
  date: string
  type: TxType
  amountMinor: number
  categoryId: string
  note: string
}

/**
 * 算出所有到期但還沒處理的定期帳，依日期由舊到新。
 *
 * @param today 'YYYY-MM-DD'，通常來自 todayISO()
 */
export function expandDueRules(
  rules: readonly RecurringLike[],
  today: string,
): DueItem[] {
  const items: DueItem[] = []
  const currentMonth = monthKey(today)

  for (const rule of rules) {
    if (!rule.active) continue

    // 沒處理過就從生效那個月開始，處理過就從鎖的下一個月接續。
    // 用鎖而不是「檢查交易是否存在」，因為使用者可能把自動產生的帳刪掉，
    // 那是刻意的刪除，不該下次開 App 又被補回來。
    const from =
      rule.lastGeneratedMonth === ''
        ? monthKey(rule.startDate)
        : addMonths(rule.lastGeneratedMonth, 1)

    // 終點取當月與 endDate 所在月份的較早者。
    const until =
      rule.endDate && monthKey(rule.endDate) < currentMonth
        ? monthKey(rule.endDate)
        : currentMonth

    for (let month = from; month <= until; month = addMonths(month, 1)) {
      const date = occurrenceDate(month, rule.dayOfMonth)

      // 規則生效前與結束後的那幾天不算。頭尾兩個月只有部分日子在範圍內，
      // 所以要逐日比對而不是只比月份。
      if (date < rule.startDate) continue
      if (rule.endDate && date > rule.endDate) continue

      // 還沒到的日子不產生：今天 8/6、規則設 31 號時，八月那筆要等 8/31
      // 過了才算數。提前產生等於把未來的支出算進這個月的報表。
      if (date > today) continue

      items.push({
        ruleId: rule.id,
        month,
        date,
        type: rule.type,
        amountMinor: rule.amountMinor,
        categoryId: rule.categoryId,
        note: rule.note,
      })
    }
  }

  // 日期相同時以 ruleId 決勝，否則多條規則的順序會跟著傳入順序跑。
  return items.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.ruleId < b.ruleId ? -1 : 1),
  )
}

/**
 * 某個月的實際到期日。
 *
 * dayOfMonth 為 31 而該月只有 28 天時必須夾到月底 ——
 * 直接 new Date(2026, 1, 31) 會默默溢位到 3 月 3 日，房租就記到錯的月份去了。
 */
function occurrenceDate(month: string, dayOfMonth: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const day = clampDayOfMonth(year, monthNumber, dayOfMonth)
  return `${month}-${String(day).padStart(2, '0')}`
}
