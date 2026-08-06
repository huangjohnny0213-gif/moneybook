import { describe, expect, test } from 'vitest'
import { categoryGlyph, firstGrapheme } from './glyph'

describe('firstGrapheme', () => {
  test('英文與中文取第一個字', () => {
    expect(firstGrapheme('abc')).toBe('a')
    expect(firstGrapheme('飲食')).toBe('飲')
  })

  test('基本 emoji 不會被切成半個代理對', () => {
    // '👍'[0] 會切出孤立的高位代理，顯示成亂碼方框。
    expect(firstGrapheme('👍')).toBe('👍')
  })

  test('帶膚色修飾符的 emoji 保持完整', () => {
    // 修飾符是獨立的碼點，跟著前一個 emoji 才有意義。
    expect(firstGrapheme('👍🏽')).toBe('👍🏽')
  })

  test('ZWJ 組合的 emoji 不會被拆開', () => {
    // Array.from('👨‍👩‍👧')[0] 只會拿到 '👨'，把一家人切成一個人。
    expect(firstGrapheme('👨‍👩‍👧')).toBe('👨‍👩‍👧')
  })

  test('國旗保持完整', () => {
    // 國旗是兩個 regional indicator，單獨一個會顯示成字母方框。
    expect(firstGrapheme('🇹🇼')).toBe('🇹🇼')
  })

  test('只取第一個，後面的丟掉', () => {
    expect(firstGrapheme('🍜午餐')).toBe('🍜')
    expect(firstGrapheme('👍👎')).toBe('👍')
  })

  test('空字串回傳空字串', () => {
    expect(firstGrapheme('')).toBe('')
  })
})

describe('categoryGlyph', () => {
  test('有設 emoji 就用 emoji', () => {
    expect(categoryGlyph({ emoji: '🍜', name: '飲食' })).toBe('🍜')
  })

  test('沒設 emoji 時退回名稱首字', () => {
    // 讓使用者還沒設定任何 emoji 前 App 就直接可用，
    // 設 emoji 變成美化而非必要步驟。
    expect(categoryGlyph({ emoji: '', name: '飲食' })).toBe('飲')
    expect(categoryGlyph({ emoji: '', name: '固定支出' })).toBe('固')
  })

  test('只有空白的 emoji 視同沒設定', () => {
    expect(categoryGlyph({ emoji: '  ', name: '交通' })).toBe('交')
  })

  test('emoji 與名稱都是空的時候回傳空字串，不丟例外', () => {
    expect(categoryGlyph({ emoji: '', name: '' })).toBe('')
  })
})
