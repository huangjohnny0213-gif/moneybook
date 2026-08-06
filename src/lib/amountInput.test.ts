import { describe, expect, test } from 'vitest'
import { EMPTY_AMOUNT, pressKey } from './amountInput'

/** 依序按下多個鍵，回傳最後的字串。 */
function type(...keys: Parameters<typeof pressKey>[1][]): string {
  // 標成 string：EMPTY_AMOUNT 是 '0' 字面量，會讓 reduce 把累加值推成 AmountKey。
  return keys.reduce<string>((acc, key) => pressKey(acc, key), EMPTY_AMOUNT)
}

describe('數字輸入', () => {
  test('起始值是 0', () => {
    expect(EMPTY_AMOUNT).toBe('0')
  })

  test('第一個數字取代開頭的 0，而不是接在後面', () => {
    expect(type('5')).toBe('5')
    expect(type('1', '2', '0')).toBe('120')
  })

  test('00 一次補兩個零', () => {
    // 這裡的金額動輒四五位數，00 鍵能少按一次。
    expect(type('1', '2', '00')).toBe('1200')
  })

  test('開頭按 00 仍然只是 0', () => {
    expect(type('00')).toBe('0')
  })
})

describe('小數點', () => {
  test('可以輸入兩位小數', () => {
    expect(type('1', '2', '.', '5', '0')).toBe('12.50')
  })

  test('開頭直接按小數點會補上前導 0', () => {
    expect(type('.', '5')).toBe('0.5')
  })

  test('第二個小數點沒有作用', () => {
    expect(type('1', '.', '5', '.')).toBe('1.5')
  })

  test('超過兩位小數的按鍵被忽略', () => {
    // 金額最小單位是分，第三位小數沒有意義，直接擋掉比事後四捨五入好懂。
    expect(type('1', '.', '2', '3', '4')).toBe('1.23')
  })

  test('小數位滿了之後 00 也不生效', () => {
    expect(type('1', '.', '2', '3', '00')).toBe('1.23')
  })
})

describe('退格', () => {
  test('刪掉最後一個字元', () => {
    expect(type('1', '2', '3', 'back')).toBe('12')
  })

  test('刪到見底時回到 0，不會變成空字串', () => {
    // 空字串會讓金額顯示區塌掉，版面跳一下。
    expect(type('5', 'back')).toBe('0')
    expect(type('5', 'back', 'back')).toBe('0')
  })

  test('可以刪掉小數點', () => {
    expect(type('1', '.', 'back')).toBe('1')
  })
})

describe('位數上限', () => {
  test('整數部分最多九位', () => {
    // 十億以上不是這個 App 的使用情境，擋住可以避免整數分溢位。
    const nine = type('1', '2', '3', '4', '5', '6', '7', '8', '9')
    expect(nine).toBe('123456789')
    expect(pressKey(nine, '0')).toBe('123456789')
  })

  test('達到上限後仍然可以按小數點', () => {
    const nine = '123456789'
    expect(pressKey(nine, '.')).toBe('123456789.')
  })
})
