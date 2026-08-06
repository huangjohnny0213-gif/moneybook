/**
 * 日期工具。
 *
 * 全專案的日期都用 'YYYY-MM-DD' 字串（本地日期），月份用 'YYYY-MM'。
 * 刻意不存 timestamp：記帳關心的是「哪一天」，時分秒只會帶來時區麻煩。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** Date 轉 'YYYY-MM-DD'。用本地時間，不能用 toISOString()（那是 UTC）。 */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 今天的日期字串。 */
export function todayISO(): string {
  return toISODate(new Date())
}

/** 'YYYY-MM-DD' → 'YYYY-MM'。 */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/** 某年某月的天數。month 是 1-12（人類習慣），不是 0-11。 */
export function daysInMonth(year: number, month: number): number {
  // 下個月的第 0 天 = 這個月的最後一天
  return new Date(year, month, 0).getDate()
}

/** 把日期夾進當月的合法範圍。2 月的 31 號會變成 28 或 29。 */
export function clampDayOfMonth(
  year: number,
  month: number,
  day: number,
): number {
  return Math.min(day, daysInMonth(year, month))
}

/** 月份加減，自動跨年。 */
export function addMonths(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number)
  // 用 0-indexed 月份丟給 Date，跨年進位交給它處理
  const shifted = new Date(year, month - 1 + delta, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

/** 從某個月往回數 count 個月，由舊到新，含結尾那個月。用於近六月趨勢。 */
export function recentMonths(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    addMonths(endMonth, index - count + 1),
  )
}

/** 'YYYY-MM' → '2026年8月'。 */
export function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${year}年${month}月`
}

/** 'YYYY-MM-DD' → '8月6日 週四'。 */
export function formatDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()]
  return `${month}月${day}日 週${weekday}`
}
