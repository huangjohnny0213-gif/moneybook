import { describe, expect, test } from 'vitest'
import {
  addMonths,
  clampDayOfMonth,
  daysInMonth,
  formatDayLabel,
  formatMonthLabel,
  monthKey,
  recentMonths,
  toISODate,
} from './dates'

describe('toISODate', () => {
  test('轉成 YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 7, 6))).toBe('2026-08-06')
  })

  test('個位數月份與日期補零', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  test('用本地時間而非 UTC', () => {
    // UTC+8 的凌晨 00:30，toISOString() 會退回前一天，記帳日期就會差一天
    expect(toISODate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
  })

  test('接近午夜仍是當天', () => {
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})

describe('monthKey', () => {
  test('從日期取出月份', () => {
    expect(monthKey('2026-08-06')).toBe('2026-08')
  })
})

describe('daysInMonth', () => {
  test('大月 31 天', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
  })

  test('小月 30 天', () => {
    expect(daysInMonth(2026, 4)).toBe(30)
  })

  test('平年二月 28 天', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  test('閏年二月 29 天', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
  })
})

describe('clampDayOfMonth', () => {
  test('當月有這天就原樣回傳', () => {
    expect(clampDayOfMonth(2026, 8, 15)).toBe(15)
  })

  test('31 號碰到平年二月夾到 28', () => {
    // 直接寫 new Date(2026, 1, 31) 會溢位成 3 月 3 日
    expect(clampDayOfMonth(2026, 2, 31)).toBe(28)
  })

  test('31 號碰到閏年二月夾到 29', () => {
    expect(clampDayOfMonth(2024, 2, 31)).toBe(29)
  })

  test('31 號碰到小月夾到 30', () => {
    expect(clampDayOfMonth(2026, 4, 31)).toBe(30)
  })
})

describe('addMonths', () => {
  test('往後跨年', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })

  test('往前跨年', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  test('加零不變', () => {
    expect(addMonths('2026-08', 0)).toBe('2026-08')
  })
})

describe('recentMonths', () => {
  test('由舊到新，含結尾那個月', () => {
    expect(recentMonths('2026-08', 6)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ])
  })

  test('跨年', () => {
    expect(recentMonths('2026-02', 4)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  test('取一個月就是它自己', () => {
    expect(recentMonths('2026-08', 1)).toEqual(['2026-08'])
  })

  test('取零個月是空陣列', () => {
    expect(recentMonths('2026-08', 0)).toEqual([])
  })
})

describe('顯示用格式', () => {
  test('月份標題', () => {
    expect(formatMonthLabel('2026-08')).toBe('2026年8月')
  })

  test('日期標題帶星期', () => {
    expect(formatDayLabel('2026-08-06')).toBe('8月6日 週四')
  })
})
