import { describe, expect, test } from 'vitest'
import { swapCategoryColor } from './categoryColors'

const categories = [
  { id: 'food', color: '#2a78d6' },
  { id: 'transport', color: '#eb6834' },
  { id: 'clothing', color: '#1baf7a' },
]

describe('swapCategoryColor', () => {
  test('沒有人佔用時直接換色', () => {
    expect(swapCategoryColor(categories, 'food', '#eda100')).toEqual([
      { id: 'food', color: '#eda100' },
    ])
  })

  test('顏色被別人佔用時兩邊對調', () => {
    // 色盤只有八色而分類正好八類，硬換會撞色。
    // 直接對調可以維持「每類一色、互不重複」，使用者也不必自己去解衝突。
    expect(swapCategoryColor(categories, 'food', '#eb6834')).toEqual([
      { id: 'food', color: '#eb6834' },
      { id: 'transport', color: '#2a78d6' },
    ])
  })

  test('選到自己原本的顏色時什麼都不做', () => {
    expect(swapCategoryColor(categories, 'food', '#2a78d6')).toEqual([])
  })

  test('找不到目標分類時回傳空陣列', () => {
    expect(swapCategoryColor(categories, 'nope', '#eda100')).toEqual([])
  })

  test('不修改傳入的陣列', () => {
    const snapshot = structuredClone(categories)
    swapCategoryColor(categories, 'food', '#eb6834')
    expect(categories).toEqual(snapshot)
  })
})
