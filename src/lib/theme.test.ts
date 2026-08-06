import { describe, expect, test } from 'vitest'
import { parseThemePref, resolveTheme } from './theme'

describe('parseThemePref', () => {
  test('接受三個合法值', () => {
    expect(parseThemePref('system')).toBe('system')
    expect(parseThemePref('light')).toBe('light')
    expect(parseThemePref('dark')).toBe('dark')
  })

  test('沒存過時回到跟隨系統', () => {
    expect(parseThemePref(null)).toBe('system')
  })

  test('讀到不認得的值時回到跟隨系統', () => {
    // localStorage 是使用者與舊版本都碰得到的地方，讀進來的東西一律當作不可信。
    expect(parseThemePref('midnight')).toBe('system')
    expect(parseThemePref('')).toBe('system')
  })
})

describe('resolveTheme', () => {
  test('手動指定時不理會系統設定', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  test('跟隨系統時由系統決定', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
