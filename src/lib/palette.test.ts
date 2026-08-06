import { describe, expect, test } from 'vitest'
import {
  CATEGORICAL_DARK,
  CATEGORICAL_LIGHT,
  categoryColorAt,
  darkStepOf,
} from './palette'

const HEX = /^#[0-9a-f]{6}$/

describe('色盤內容', () => {
  test('淺色與深色各有 8 個色階', () => {
    expect(CATEGORICAL_LIGHT).toHaveLength(8)
    expect(CATEGORICAL_DARK).toHaveLength(8)
  })

  test('全部是小寫六位 hex', () => {
    for (const color of [...CATEGORICAL_LIGHT, ...CATEGORICAL_DARK]) {
      expect(color).toMatch(HEX)
    }
  })

  test('同一組之內顏色互不重複', () => {
    expect(new Set(CATEGORICAL_LIGHT).size).toBe(8)
    expect(new Set(CATEGORICAL_DARK).size).toBe(8)
  })
})

describe('categoryColorAt', () => {
  test('回傳對應索引的淺色色階', () => {
    expect(categoryColorAt(0)).toBe(CATEGORICAL_LIGHT[0])
    expect(categoryColorAt(7)).toBe(CATEGORICAL_LIGHT[7])
  })

  test('索引超出色盤時丟例外，不循環套色', () => {
    // 自動生成的第 9 色在紅綠色盲眼中幾乎必然與既有色撞在一起。
    // 靜靜地取模循環只會讓這個問題晚幾個月才被發現。
    expect(() => categoryColorAt(8)).toThrow()
    expect(() => categoryColorAt(-1)).toThrow()
  })

  test('非整數索引丟例外', () => {
    expect(() => categoryColorAt(1.5)).toThrow()
  })
})

describe('darkStepOf', () => {
  test('把淺色色階換成同一個色相的深色版本', () => {
    // 深色模式不是把淺色自動反轉，是為深色底另外選過的同八個色相。
    expect(darkStepOf(CATEGORICAL_LIGHT[0])).toBe(CATEGORICAL_DARK[0])
    expect(darkStepOf(CATEGORICAL_LIGHT[4])).toBe(CATEGORICAL_DARK[4])
  })

  test('大小寫不影響對應', () => {
    expect(darkStepOf(CATEGORICAL_LIGHT[1].toUpperCase())).toBe(
      CATEGORICAL_DARK[1],
    )
  })

  test('不在色盤裡的顏色原樣回傳', () => {
    // 理論上不會發生（App 只讓使用者從 8 色裡選），但舊備份匯入時
    // 可能帶進手動改過的顏色，這時原樣顯示好過丟例外讓整頁掛掉。
    expect(darkStepOf('#123456')).toBe('#123456')
  })
})
