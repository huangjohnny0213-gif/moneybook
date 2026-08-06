import type { TxType } from '../types'

/**
 * 金額換算。
 *
 * 全專案的金額都以「整數分」儲存（12050 代表 120.50），因為浮點數存錢
 * 累積數百筆後月總計會出現一元誤差。這是唯一允許做 100 倍換算的檔案。
 */

const AMOUNT_PATTERN = /^(\d*)(?:\.(\d*))?$/

/** 把使用者輸入的字串轉成整數分。無法解析時丟出錯誤。 */
export function toMinor(input: string): number {
  const cleaned = input.trim().replace(/,/g, '')
  if (cleaned === '' || cleaned === '.') return 0

  const match = cleaned.match(AMOUNT_PATTERN)
  if (!match) throw new Error(`金額格式不正確：${input}`)

  const [, whole, frac = ''] = match
  // 補到三位才能對第三位做四捨五入；不先轉 float 是為了避開 8.29 * 100 = 828.99…
  const padded = frac.padEnd(3, '0')
  const cents = Number(padded.slice(0, 2))
  const roundUp = Number(padded[2]) >= 5 ? 1 : 0

  return Number(whole || '0') * 100 + cents + roundUp
}

/** 把整數分轉回元，供計算或匯出使用。 */
export function fromMinor(minor: number): number {
  return minor / 100
}

/** 顯示用格式：整數不帶小數點，有零頭才顯示兩位，一律加千分位。 */
export function formatAmount(minor: number): string {
  const abs = Math.abs(minor)
  const whole = Math.trunc(abs / 100).toLocaleString('en-US')
  const cents = abs % 100
  return cents === 0 ? whole : `${whole}.${String(cents).padStart(2, '0')}`
}

/** 依交易類型加上正負號，零不加號。 */
export function formatSigned(minor: number, type: TxType): string {
  if (minor === 0) return '0'
  return (type === 'expense' ? '-' : '+') + formatAmount(minor)
}
