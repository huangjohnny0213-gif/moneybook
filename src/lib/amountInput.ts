/**
 * 自製數字鍵盤的按鍵邏輯。
 *
 * 抽成純函式而不是塞在元件的 setState 裡，是因為這裡的規則（重複的小數點、
 * 第三位小數、退格到見底）全是容易寫錯又不容易在畫面上察覺的細節。
 */

export type AmountKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '00'
  | '.'
  | 'back'

/** 金額輸入的起始狀態。 */
export const EMPTY_AMOUNT = '0'

/** 整數部分的位數上限。十億以上不是這個 App 的使用情境。 */
const MAX_INTEGER_DIGITS = 9

/** 小數位數上限。最小單位是分，第三位小數沒有意義。 */
const MAX_DECIMALS = 2

/** 按下一個鍵，回傳新的金額字串。不合法的按鍵原樣回傳，不丟例外。 */
export function pressKey(current: string, key: AmountKey): string {
  if (key === 'back') return backspace(current)
  if (key === '.') return current.includes('.') ? current : `${current}.`

  return appendDigits(current, key)
}

function backspace(current: string): string {
  const next = current.slice(0, -1)
  // 空字串會讓金額顯示區塌掉、版面跳一下，一律退回 0。
  return next === '' ? EMPTY_AMOUNT : next
}

function appendDigits(current: string, digits: string): string {
  const [whole, decimals] = current.split('.')
  const hasPoint = current.includes('.')

  if (hasPoint) {
    const room = MAX_DECIMALS - decimals.length
    // 空間不足時整個按鍵忽略，而不是只塞得下的部分 ——
    // 按 00 只補一個 0 會比完全沒反應更讓人困惑。
    if (digits.length > room) return current
    return current + digits
  }

  // 開頭的 0 是佔位符，第一個數字要取代它而不是接在後面。
  // 再收掉多餘的前導零，否則在起始狀態按 00 會留下 '00'。
  const base = whole === EMPTY_AMOUNT ? '' : whole
  const merged = (base + digits).replace(/^0+(?=\d)/, '')
  if (merged.length > MAX_INTEGER_DIGITS) return current

  return merged === '' ? EMPTY_AMOUNT : merged
}
