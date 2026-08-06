import { describe, expect, test } from 'vitest'
import { formatAmount, formatSigned, fromMinor, toMinor } from './money'

describe('toMinor', () => {
  test('整數金額轉成分', () => {
    expect(toMinor('120')).toBe(12000)
  })

  test('一位小數補足成兩位', () => {
    expect(toMinor('120.5')).toBe(12050)
  })

  test('兩位小數精確轉換', () => {
    expect(toMinor('120.55')).toBe(12055)
  })

  test('會產生浮點誤差的金額仍然精確', () => {
    // parseFloat('8.29') * 100 === 828.9999999999999，直接四捨五入會錯
    expect(toMinor('8.29')).toBe(829)
    expect(toMinor('1.005')).toBe(101)
  })

  test('忽略千分位逗號與前後空白', () => {
    expect(toMinor(' 1,234.50 ')).toBe(123450)
  })

  test('空字串與單獨小數點視為零', () => {
    expect(toMinor('')).toBe(0)
    expect(toMinor('.')).toBe(0)
  })

  test('小數點開頭與結尾都能解析', () => {
    expect(toMinor('.5')).toBe(50)
    expect(toMinor('120.')).toBe(12000)
  })

  test('拒絕非數字輸入', () => {
    expect(() => toMinor('abc')).toThrow()
    expect(() => toMinor('1.2.3')).toThrow()
  })

  test('拒絕負數，正負號由交易類型決定', () => {
    expect(() => toMinor('-120')).toThrow()
  })
})

describe('fromMinor', () => {
  test('分轉回元', () => {
    expect(fromMinor(12050)).toBe(120.5)
  })

  test('零', () => {
    expect(fromMinor(0)).toBe(0)
  })
})

describe('formatAmount', () => {
  test('整數金額不顯示小數點', () => {
    expect(formatAmount(12000)).toBe('120')
  })

  test('有零頭時顯示兩位小數', () => {
    expect(formatAmount(12050)).toBe('120.50')
  })

  test('加上千分位', () => {
    expect(formatAmount(123456700)).toBe('1,234,567')
  })

  test('零', () => {
    expect(formatAmount(0)).toBe('0')
  })
})

describe('formatSigned', () => {
  test('支出顯示負號', () => {
    expect(formatSigned(12000, 'expense')).toBe('-120')
  })

  test('收入顯示正號', () => {
    expect(formatSigned(12000, 'income')).toBe('+120')
  })

  test('零不加正負號', () => {
    expect(formatSigned(0, 'expense')).toBe('0')
  })
})
