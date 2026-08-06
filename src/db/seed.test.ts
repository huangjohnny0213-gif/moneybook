import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { categoryColorAt } from '../lib/palette'
import { db } from './schema'
import { DEFAULT_CATEGORIES, seedCategoriesIfEmpty } from './seed'

beforeEach(async () => {
  await db.categories.clear()
})

describe('seedCategoriesIfEmpty', () => {
  test('空資料庫時寫入全部預設分類', async () => {
    expect(await seedCategoriesIfEmpty()).toBe(true)
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length)
  })

  test('連續呼叫三次不會產生重複分類', async () => {
    // 每次開 App 都會呼叫一次，開三次不能變成三份分類。
    await seedCategoriesIfEmpty()
    expect(await seedCategoriesIfEmpty()).toBe(false)
    expect(await seedCategoriesIfEmpty()).toBe(false)
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length)
  })

  test('使用者封存過的預設分類不會被重設回來', async () => {
    await seedCategoriesIfEmpty()
    const target = DEFAULT_CATEGORIES[0]
    await db.categories.update(target.id, { archived: true })

    await seedCategoriesIfEmpty()

    expect((await db.categories.get(target.id))?.archived).toBe(true)
  })

  test('使用者刪掉的預設分類不會被塞回來', async () => {
    await seedCategoriesIfEmpty()
    const target = DEFAULT_CATEGORIES[0]
    await db.categories.delete(target.id)

    await seedCategoriesIfEmpty()

    expect(await db.categories.get(target.id)).toBeUndefined()
  })
})

describe('seed 時自動配色', () => {
  test('寫進資料庫的每一類都有具體顏色', async () => {
    await seedCategoriesIfEmpty()
    const stored = await db.categories.toArray()
    for (const category of stored) {
      expect(category.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  test('8 類的顏色互不重複', async () => {
    await seedCategoriesIfEmpty()
    const colors = (await db.categories.toArray()).map((c) => c.color)
    expect(new Set(colors).size).toBe(colors.length)
  })

  test('顏色依色盤的固定順序配給', async () => {
    await seedCategoriesIfEmpty()
    const first = await db.categories.get(DEFAULT_CATEGORIES[0].id)
    expect(first?.color).toBe(categoryColorAt(0))
  })

  test('使用者改過的顏色不會被後續的 seed 覆寫', async () => {
    await seedCategoriesIfEmpty()
    const target = DEFAULT_CATEGORIES[0]
    await db.categories.update(target.id, { color: categoryColorAt(7) })

    await seedCategoriesIfEmpty()

    expect((await db.categories.get(target.id))?.color).toBe(categoryColorAt(7))
  })
})

describe('DEFAULT_CATEGORIES', () => {
  test('id 全部唯一', () => {
    const ids = DEFAULT_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('id 是固定 slug，不是隨機 UUID', () => {
    // 隨機 id 會讓備份還原後所有交易變成未知分類，見 seed.ts 的說明。
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  test('支出與收入各至少有一類', () => {
    const types = DEFAULT_CATEGORIES.map((c) => c.type)
    expect(types).toContain('expense')
    expect(types).toContain('income')
  })

  test('預設分類都不是封存狀態', () => {
    expect(DEFAULT_CATEGORIES.every((c) => !c.archived)).toBe(true)
  })

  test('原始碼裡的 emoji 與顏色都是空的', () => {
    // 顏色必須來自色盤而非硬寫在這裡，否則色盲安全的順序就失去意義。
    // emoji 留空是刻意的，由使用者在 App 裡自己挑。
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.emoji).toBe('')
      expect(category.color).toBe('')
    }
  })

  test('支出 6 類、收入 2 類，剛好用滿 8 色色盤', () => {
    const expense = DEFAULT_CATEGORIES.filter((c) => c.type === 'expense')
    const income = DEFAULT_CATEGORIES.filter((c) => c.type === 'income')
    expect(expense).toHaveLength(6)
    expect(income).toHaveLength(2)
  })

  test('兩個「其他」的 id 不同', () => {
    // 名稱相同但 id 相同的話，收入那筆會直接覆蓋掉支出那筆。
    const others = DEFAULT_CATEGORIES.filter((c) => c.name === '其他')
    expect(others).toHaveLength(2)
    expect(others[0].id).not.toBe(others[1].id)
  })

  test('同類型之內 sortOrder 不重複', () => {
    // 重複的 sortOrder 會讓分類九宮格的排列在每次查詢後不一樣。
    for (const type of ['expense', 'income'] as const) {
      const orders = DEFAULT_CATEGORIES.filter((c) => c.type === type).map(
        (c) => c.sortOrder,
      )
      expect(new Set(orders).size).toBe(orders.length)
    }
  })
})
